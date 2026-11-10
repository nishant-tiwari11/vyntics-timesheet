import { EDIT_WINDOW_DAYS, LOCKED_MESSAGE, earliestEditable, isLocked } from "./rules";
import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { TimesheetError, assertDate, assertId, toError } from "./errors";
import { isProject } from "./projects";
import { todayInOffice } from "./dates";
import type { LogStatus, WorkLog, WorkLogWithPerson } from "./types";

const LOG_STATUSES: LogStatus[] = ["pending", "approved", "rejected"];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** What a person fills in for one time log. Hours are worked out from the start and end time. */
export type LogFields = {
  entry: string;
  /** Any date up to today (office time zone). */
  logDate: string;
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
  project: string;
  /** The person chose not to ask for comp-off for this day. Left out = unchanged. */
  noCompOff?: boolean;
};

/** Checks everything the form sends. The browser checks too, but only this check counts. */
function cleanFields(input: LogFields, admin = false) {
  const day = assertDate(input.logDate, "date");
  if (day > todayInOffice()) throw new TimesheetError("You can't add a log for a future date.");
  // Admins may use any past date; the 7-day lock is for employees.
  if (!admin && isLocked(day, todayInOffice())) throw new TimesheetError(LOCKED_MESSAGE);

  const content = typeof input.entry === "string" ? input.entry.trim() : "";
  if (!content) throw new TimesheetError("Please write what you worked on.");
  if (content.length > 2000) throw new TimesheetError("Entries can be up to 2000 characters.");

  const start = typeof input.start === "string" ? input.start : "";
  const end = typeof input.end === "string" ? input.end : "";
  if (!start || !end) throw new TimesheetError("Enter both a start and an end time.");
  if (!TIME.test(start) || !TIME.test(end)) throw new TimesheetError("Enter the times like 09:30.");
  if (minutes(end) <= minutes(start)) throw new TimesheetError("The end time must be after the start time.");
  const hours = Math.round(((minutes(end) - minutes(start)) / 60) * 100) / 100;

  if (!isProject(input.project)) throw new TimesheetError("Please choose a project from the list.");

  const base = { log_date: day, content, hours, start_time: start, end_time: end, project: input.project };
  return typeof input.noCompOff === "boolean" ? { ...base, no_comp_off: input.noCompOff } : base;
}

/** Add a time log. New entries start as pending. */
export async function addLog(input: LogFields): Promise<WorkLog> {
  const fields = cleanFields(input);
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .insert({ user_id: me.id, ...fields })
    .select()
    .single();
  if (error) throw toError(error, "Couldn't save your entry. Please try again.");
  return data;
}

/** Change one of your own entries. Only pending entries can be edited; the database enforces it too. */
export async function updateLog(id: string, input: LogFields): Promise<void> {
  assertId(id, "entry");
  const fields = cleanFields(input);
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .update(fields)
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "pending")
    .gte("log_date", earliestEditable(todayInOffice())) // an entry older than 7 days is locked
    .select("id");
  if (error) throw toError(error, "Couldn't save your changes. Please try again.");
  if (!data?.length) throw new TimesheetError(`Only your own pending entries from the last ${EDIT_WINDOW_DAYS} days can be edited.`);
}

/** Delete one of your own entries. Only pending entries can be deleted. */
export async function deleteLog(id: string): Promise<void> {
  assertId(id, "entry");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "pending")
    .gte("log_date", earliestEditable(todayInOffice()))
    .select("id");
  if (error) throw toError(error, "Couldn't delete the entry. Please try again.");
  if (!data?.length) throw new TimesheetError(`Only your own pending entries from the last ${EDIT_WINDOW_DAYS} days can be deleted.`);
}

// ---------------------------- Admin only ----------------------------

/** Admin: add a time log for an employee on any past date. It is approved straight away (the database does that). */
export async function adminAddLog(userId: string, input: LogFields): Promise<void> {
  assertId(userId, "employee");
  const fields = cleanFields(input, true);
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.from("work_logs").insert({ user_id: userId, ...fields });
  if (error) throw toError(error, "Couldn't save the entry. Please try again.");
}

/** Admin: change anyone's time log, whatever its status or date. */
export async function adminUpdateLog(id: string, input: LogFields): Promise<void> {
  assertId(id, "entry");
  const fields = cleanFields(input, true);
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("work_logs").update(fields).eq("id", id).select("id");
  if (error) throw toError(error, "Couldn't save the changes. Please try again.");
  if (!data?.length) throw new TimesheetError("That entry no longer exists. Please refresh.");
}

/** Admin: delete anyone's time log. */
export async function adminDeleteLog(id: string): Promise<void> {
  assertId(id, "entry");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("work_logs").delete().eq("id", id).select("id");
  if (error) throw toError(error, "Couldn't delete the entry. Please try again.");
  if (!data?.length) throw new TimesheetError("That entry no longer exists. Please refresh.");
}


/** Everyone's entries for one date. */
export async function listAllLogs(date: string): Promise<WorkLogWithPerson[]> {
  const day = assertDate(date);
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .select("*, owner:profiles!work_logs_user_id_fkey(full_name, email)")
    .eq("log_date", day)
    .order("created_at", { ascending: true });
  if (error) throw toError(error, "Couldn't load work logs. Please try again.");
  return data;
}

// ---------------------------- Time-log table and hour totals ----------------------------

export type LogPage = { rows: WorkLogWithPerson[]; total: number };

/**
 * One page of work-log entries, newest first. `scope: "mine"` is your own entries;
 * `scope: "all"` is everyone's and is admin only (checked here, and by row level security).
 * `from` / `to` are optional inclusive dates.
 */
export async function listLogPage(opts: {
  scope: "mine" | "all";
  from: string | null;
  to: string | null;
  status?: LogStatus | null;
  /** Plain-text search in the entry and project. */
  search?: string | null;
  page: number;
  pageSize: number;
}): Promise<LogPage> {
  const from = opts.from === null ? null : assertDate(opts.from, "start date");
  const to = opts.to === null ? null : assertDate(opts.to, "end date");
  const pageSize = Math.min(Math.max(Math.trunc(Number(opts.pageSize)) || 10, 1), 50);
  const page = Math.max(Math.trunc(Number(opts.page)) || 1, 1);

  const status = opts.status ?? null;
  if (status !== null && !LOG_STATUSES.includes(status)) throw new TimesheetError("Please choose a valid status.");
  // Keep only characters that are safe inside a PostgREST filter value.
  const term = (opts.search ?? "").replace(/[^\p{L}\p{N} .'@-]/gu, " ").trim().slice(0, 60);

  const me = opts.scope === "all" ? await requireAdmin() : await requireUser();
  const supabase = await db();

  let query = supabase
    .from("work_logs")
    .select("*, owner:profiles!work_logs_user_id_fkey(full_name, email)", { count: "exact" });
  if (opts.scope === "mine") query = query.eq("user_id", me.id);
  if (from) query = query.gte("log_date", from);
  if (to) query = query.lte("log_date", to);
  if (status) query = query.eq("status", status);
  if (term) query = query.or(`content.ilike.%${term}%,project.ilike.%${term}%`);

  const start = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1);

  if (error) {
    // Asking for a page past the end: report the real total so the caller can jump to the last page.
    if (error.code === "PGRST103") {
      let countQuery = supabase.from("work_logs").select("id", { count: "exact", head: true });
      if (opts.scope === "mine") countQuery = countQuery.eq("user_id", me.id);
      if (from) countQuery = countQuery.gte("log_date", from);
      if (to) countQuery = countQuery.lte("log_date", to);
      if (status) countQuery = countQuery.eq("status", status);
      if (term) countQuery = countQuery.or(`content.ilike.%${term}%,project.ilike.%${term}%`);
      const res = await countQuery;
      if (res.error) throw toError(res.error, "Couldn't load time logs. Please try again.");
      return { rows: [], total: res.count ?? 0 };
    }
    throw toError(error, "Couldn't load time logs. Please try again.");
  }
  return { rows: data, total: count ?? data.length };
}

/**
 * Every entry between two dates (inclusive), oldest first, for the calendar.
 * `scope: "all"` is everyone's and is admin only (checked here, and by row level security).
 * Capped at 800 rows so a busy month can't make the page heavy.
 */
export async function listLogsBetween(opts: {
  scope: "mine" | "all";
  from: string;
  to: string;
}): Promise<WorkLogWithPerson[]> {
  const from = assertDate(opts.from, "start date");
  const to = assertDate(opts.to, "end date");
  const me = opts.scope === "all" ? await requireAdmin() : await requireUser();
  const supabase = await db();

  let query = supabase
    .from("work_logs")
    .select("*, owner:profiles!work_logs_user_id_fkey(full_name, email)")
    .gte("log_date", from)
    .lte("log_date", to);
  if (opts.scope === "mine") query = query.eq("user_id", me.id);

  const { data, error } = await query
    .order("log_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(800);
  if (error) throw toError(error, "Couldn't load the calendar. Please try again.");
  return data;
}

/** Your own logged hours per day between two dates (inclusive). Days without hours are left out. */
export async function listMyHoursByDate(from: string, to: string): Promise<Record<string, number>> {
  const start = assertDate(from, "start date");
  const end = assertDate(to, "end date");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .select("log_date, hours")
    .eq("user_id", me.id)
    .neq("status", "rejected")
    .gte("log_date", start)
    .lte("log_date", end);
  if (error) throw toError(error, "Couldn't load your hours. Please try again.");

  const byDate: Record<string, number> = {};
  for (const row of data) {
    if (row.hours) byDate[row.log_date] = Math.round(((byDate[row.log_date] ?? 0) + row.hours) * 100) / 100;
  }
  return byDate;
}

/** Approve or reject someone else's entry. The database refuses decisions on your own entries. */
export async function decideLog(id: string, decision: "approved" | "rejected"): Promise<void> {
  assertId(id, "entry");
  if (decision !== "approved" && decision !== "rejected") throw new TimesheetError("Please choose approve or reject.");
  const admin = await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .update({ status: decision })
    .eq("id", id)
    .neq("user_id", admin.id)
    .select("id");
  if (error) throw toError(error, "Couldn't save the decision. Please try again.");
  if (!data?.length) throw new TimesheetError("That entry could not be found, or it is your own.");
}
