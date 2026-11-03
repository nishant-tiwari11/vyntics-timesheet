import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { mondayOf, todayInOffice } from "./dates";
import { TimesheetError, assertId, assertHours, assertWeekStart, toError } from "./errors";
import { weekTotal } from "./hours";
import { isProject } from "./projects";
import { DAY_KEYS, type DayHours, type Week, type WeekRow, type WeekWithPerson, type WeekWithRows } from "./types";

const LOCKED = "This week is submitted or approved, so it can't be changed.";

function sortRows(week: WeekWithRows): WeekWithRows {
  week.timesheet_rows.sort((a, b) => a.position - b.position || a.project.localeCompare(b.project));
  return week;
}

/** The signed-in user's week and its rows, or null if they haven't started that week. */
export async function getWeek(weekStart: string): Promise<WeekWithRows | null> {
  const start = assertWeekStart(weekStart);
  const me = await requireUser();
  const supabase = await db();

  const { data, error } = await supabase
    .from("timesheet_weeks")
    .select("*, timesheet_rows(*)")
    .eq("user_id", me.id)
    .eq("week_start", start)
    .maybeSingle();
  if (error) throw toError(error, "Couldn't load this week. Please try again.");
  return data ? sortRows(data) : null;
}

/** Returns the week, creating an empty draft first if there isn't one. */
export async function ensureWeek(weekStart: string): Promise<WeekWithRows> {
  const start = assertWeekStart(weekStart);
  const existing = await getWeek(start);
  if (existing) return existing;

  const me = await requireUser();
  const supabase = await db();
  const { error } = await supabase
    .from("timesheet_weeks")
    .insert({ user_id: me.id, week_start: start, status: "draft" });
  // 23505 = someone (another tab) created it a moment ago; just read it back.
  if (error && error.code !== "23505") throw toError(error, "Couldn't start this week. Please try again.");

  const created = await getWeek(start);
  if (!created) throw new TimesheetError("Couldn't start this week. Please try again.");
  return created;
}

function cleanDays(days: Partial<DayHours>): DayHours {
  const out = {} as DayHours;
  for (const key of DAY_KEYS) {
    out[key] = assertHours(days[key] ?? 0, "Hours");
  }
  return out;
}

/**
 * Create a row (no rowId) or update one (with rowId). Used by autosave.
 * The database refuses the change if the week isn't a draft / sent back.
 */
export async function saveRow(
  weekId: string,
  project: string,
  days: Partial<DayHours>,
  opts: { rowId?: string; position?: number } = {}
): Promise<WeekRow> {
  assertId(weekId, "week");
  await requireUser();
  const name = project.trim();
  if (!isProject(name)) throw new TimesheetError("Please choose a project from the list.");
  const values = { project: name, ...cleanDays(days) };
  const supabase = await db();

  // A day can't add up to more than 24 hours across all rows of the week.
  const { data: others, error: othersError } = await supabase
    .from("timesheet_rows")
    .select("id, mon, tue, wed, thu, fri, sat, sun")
    .eq("week_id", weekId);
  if (othersError) throw toError(othersError, "Couldn't save your hours. Please try again.");
  for (const key of DAY_KEYS) {
    const rest = (others ?? []).filter((r) => r.id !== opts.rowId).reduce((sum, r) => sum + r[key], 0);
    if (rest + values[key] > 24) throw new TimesheetError("A day can't have more than 24 hours.");
  }

  if (opts.rowId) {
    assertId(opts.rowId, "row");
    const { data, error } = await supabase
      .from("timesheet_rows")
      .update({ ...values, ...(opts.position !== undefined ? { position: opts.position } : {}) })
      .eq("id", opts.rowId)
      .eq("week_id", weekId)
      .select()
      .maybeSingle();
    if (error) throw toError(error, "Couldn't save your hours. Please try again.");
    if (!data) throw new TimesheetError(LOCKED, "conflict");
    return data;
  }

  let position = opts.position;
  if (position === undefined) {
    const { count } = await supabase
      .from("timesheet_rows")
      .select("id", { count: "exact", head: true })
      .eq("week_id", weekId);
    position = count ?? 0;
  }
  const { data, error } = await supabase
    .from("timesheet_rows")
    .insert({ week_id: weekId, position, ...values })
    .select()
    .single();
  if (error) throw toError(error, "Couldn't add the row. Please try again.");
  return data;
}

export async function deleteRow(rowId: string): Promise<void> {
  assertId(rowId, "row");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("timesheet_rows").delete().eq("id", rowId).select("id");
  if (error) throw toError(error, "Couldn't delete the row. Please try again.");
  if (!data?.length) throw new TimesheetError(LOCKED, "conflict");
}

/** Lock the week and send it for approval. Only your own draft / sent-back weeks with hours, not future weeks. */
export async function submitWeek(weekId: string): Promise<Week> {
  assertId(weekId, "week");
  const me = await requireUser();
  const supabase = await db();

  const { data: current, error: readError } = await supabase
    .from("timesheet_weeks")
    .select("*, timesheet_rows(*)")
    .eq("id", weekId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (readError) throw toError(readError, "Couldn't submit this week. Please try again.");
  if (!current || !["draft", "sent_back"].includes(current.status)) {
    throw new TimesheetError("This week can't be submitted. It may already be submitted or approved.", "conflict");
  }
  if (current.week_start > mondayOf(todayInOffice())) {
    throw new TimesheetError("You can't submit a week that hasn't started yet.");
  }
  if (weekTotal(current.timesheet_rows) <= 0) {
    throw new TimesheetError("Add some hours before submitting this week.");
  }

  const { data, error } = await supabase
    .from("timesheet_weeks")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", weekId)
    .eq("user_id", me.id)
    .in("status", ["draft", "sent_back"])
    .select()
    .maybeSingle();
  if (error) throw toError(error, "Couldn't submit this week. Please try again.");
  if (!data) {
    throw new TimesheetError("This week can't be submitted. It may already be submitted or approved.", "conflict");
  }
  return data;
}

/** Take a submitted week back to draft so it can be edited. Approved weeks can't be reopened. */
export async function reopenWeek(weekId: string): Promise<Week> {
  assertId(weekId, "week");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("timesheet_weeks")
    .update({ status: "draft", submitted_at: null })
    .eq("id", weekId)
    .eq("user_id", me.id)
    .eq("status", "submitted")
    .select()
    .maybeSingle();
  if (error) throw toError(error, "Couldn't reopen this week. Please try again.");
  if (!data) throw new TimesheetError("Only a submitted week can be reopened. It may have just been approved.", "conflict");
  return data;
}

// ---------------------------- Admin only ----------------------------

/** Every person's week for the given Monday, with their rows and name. */
export async function listAllWeeks(weekStart: string): Promise<WeekWithPerson[]> {
  const start = assertWeekStart(weekStart);
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("timesheet_weeks")
    .select("*, owner:profiles!timesheet_weeks_user_id_fkey(full_name, email), timesheet_rows(*)")
    .eq("week_start", start)
    .order("created_at", { ascending: true });
  if (error) throw toError(error, "Couldn't load timesheets. Please try again.");
  return data.map((w) => sortRows(w) as WeekWithPerson);
}

/**
 * Approve a submitted week, or send a submitted/approved week back to draft.
 * Optional note is shown to the employee. Admins can't decide their own week.
 */
export async function decideWeek(
  weekId: string,
  decision: "approved" | "draft",
  note?: string
): Promise<Week> {
  assertId(weekId, "week");
  if (decision !== "approved" && decision !== "draft") {
    throw new TimesheetError("Please choose approve or send back.");
  }
  const admin = await requireAdmin();
  const supabase = await db();

  const { data: current, error: readError } = await supabase
    .from("timesheet_weeks")
    .select("user_id")
    .eq("id", weekId)
    .maybeSingle();
  if (readError) throw toError(readError, "Couldn't save your decision. Please try again.");
  if (!current) throw new TimesheetError("That timesheet no longer exists. Please refresh.");
  if (current.user_id === admin.id) {
    throw new TimesheetError(
      decision === "approved" ? "You cannot approve your own timesheet." : "You cannot send back your own timesheet."
    );
  }

  const { data, error } = await supabase
    .from("timesheet_weeks")
    .update({
      status: decision,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: note?.trim().slice(0, 500) || null,
      ...(decision === "draft" ? { submitted_at: null } : {}),
    })
    .eq("id", weekId)
    .in("status", decision === "approved" ? ["submitted"] : ["submitted", "approved"])
    .select()
    .maybeSingle();
  if (error) throw toError(error, "Couldn't save your decision. Please try again.");
  if (!data) {
    throw new TimesheetError(
      decision === "approved"
        ? "Only a submitted timesheet can be approved."
        : "Only a submitted or approved timesheet can be sent back."
    );
  }
  return data;
}

/** Your own weeks (with rows) whose Monday is between the two dates, inclusive. Read-only. */
export async function listMyWeeks(fromWeekStart: string, toWeekStart: string): Promise<WeekWithRows[]> {
  const from = assertWeekStart(fromWeekStart);
  const to = assertWeekStart(toWeekStart);
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("timesheet_weeks")
    .select("*, timesheet_rows(*)")
    .eq("user_id", me.id)
    .gte("week_start", from)
    .lte("week_start", to)
    .order("week_start", { ascending: true });
  if (error) throw toError(error, "Couldn't load your hours. Please try again.");
  return data.map(sortRows);
}
