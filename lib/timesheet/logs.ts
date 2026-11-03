import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { TimesheetError, assertDate, assertHours, assertId, toError } from "./errors";
import { todayInOffice } from "./dates";
import type { WorkLog, WorkLogWithPerson } from "./types";

/** Entries can only be added or deleted for today (office time). Callers pass the date explicitly. */
function assertToday(logDate: unknown): string {
  const day = assertDate(logDate, "date");
  if (day !== todayInOffice()) throw new TimesheetError("You can only change today's log.");
  return day;
}

/** Add an end-of-day entry for `logDate`, which must be today in the office time zone. `hours` is optional. */
export async function addLog(entry: string, hours: number | null | undefined, logDate: string): Promise<WorkLog> {
  const day = assertToday(logDate);
  const content = typeof entry === "string" ? entry.trim() : "";
  if (!content) throw new TimesheetError("Please write what you worked on.");
  if (content.length > 2000) throw new TimesheetError("Entries can be up to 2000 characters.");
  const cleanHours = hours === null || hours === undefined ? null : assertHours(hours);

  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .insert({ user_id: me.id, log_date: day, content, hours: cleanHours })
    .select()
    .single();
  if (error) throw toError(error, "Couldn't save your entry. Please try again.");
  return data;
}

/** Delete one of your own entries. `logDate` must be today; earlier days are read-only. */
export async function deleteLog(id: string, logDate: string): Promise<void> {
  assertId(id, "entry");
  const day = assertToday(logDate);
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("log_date", day)
    .select("id");
  if (error) throw toError(error, "Couldn't delete the entry. Please try again.");
  if (!data?.length) throw new TimesheetError("You can only delete entries from today.");
}

/** Your own entries from the last `limitDays` days that have entries, newest first. */
export async function listLogs(limitDays = 8): Promise<WorkLog[]> {
  const days = Math.min(Math.max(Math.trunc(Number(limitDays)) || 8, 1), 60);
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("user_id", me.id)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw toError(error, "Couldn't load your work log. Please try again.");

  const keep = new Set<string>();
  for (const row of data) {
    if (keep.size < days) keep.add(row.log_date);
  }
  return data.filter((row) => keep.has(row.log_date));
}

// ---------------------------- Admin only ----------------------------

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
