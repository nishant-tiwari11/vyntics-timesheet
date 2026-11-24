import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { addDays, todayInOffice } from "./dates";
import { TimesheetError, assertId, toError } from "./errors";
import { dutyEligible, type DutyDay, type DutyLocation, type DutySession, type DutyState } from "./dutyTypes";

// Duty: an employee goes on duty (from the office or from home) and off duty. Each stretch keeps its start and stop, so the day's
// duty hours are the sum of the stretches. This is separate from the timesheet (the work they report): the admin sees both.
// Starting and stopping go through two database functions that act for the signed-in person only.

type Row = { id: string; duty_date: string; started_at: string; ended_at: string | null; location: string; auto_closed: boolean };

const seconds = (from: string, to: string | null, now = Date.now()) => Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
const asLocation = (v: string): DutyLocation => (v === "wfh" ? "wfh" : "office");

/** Where the signed-in person stands right now. Null for people who don't go on duty (admins, read-only viewers). */
export async function getMyDuty(): Promise<DutyState | null> {
  const me = await requireUser();
  if (!dutyEligible(me.role)) return null;
  const supabase = await db();
  const today = todayInOffice();
  const { data, error } = await supabase
    .from("duty_logs" as never)
    .select("id, duty_date, started_at, ended_at, location, auto_closed")
    .eq("user_id", me.id)
    .or(`duty_date.eq.${today},ended_at.is.null`)
    .order("started_at", { ascending: true })
    .limit(50);
  if (error) {
    // Before step41 the table doesn't exist: the control simply isn't shown.
    if (["42P01", "PGRST205"].includes((error as { code?: string }).code ?? "")) return null;
    throw toError(error, "Couldn't load your duty. Please try again.");
  }
  const rows = (data ?? []) as unknown as Row[];
  const open = rows.find((r) => r.ended_at === null && r.duty_date === today) ?? null;
  return {
    onDuty: !!open,
    since: open?.started_at ?? null,
    location: open ? asLocation(open.location) : null,
    // Today's finished stretches. The open one is added live by the browser so the clock keeps moving.
    todaySeconds: rows.filter((r) => r.duty_date === today && r.ended_at !== null).reduce((n, r) => n + seconds(r.started_at, r.ended_at), 0),
  };
}

export async function startDuty(location: string): Promise<void> {
  if (location !== "office" && location !== "wfh") throw new TimesheetError("Choose office or work from home.");
  await requireUser();
  const supabase = await db();
  const { error } = await supabase.rpc("duty_start" as never, { p_location: location } as never);
  if (error) throw toError(error, "Couldn't start your duty. Please try again.");
}

export async function stopDuty(): Promise<void> {
  await requireUser();
  const supabase = await db();
  const { error } = await supabase.rpc("duty_stop" as never);
  if (error) throw toError(error, "Couldn't end your duty. Please try again.");
}

/** Admin: one person's duty by day for the last `days` days, next to the hours they reported on their timesheet. */
export async function loadDutyDays(userId: string, days = 14): Promise<DutyDay[]> {
  assertId(userId, "employee");
  await requireAdmin();
  const supabase = await db();
  const today = todayInOffice();
  const from = addDays(today, -(days - 1));
  const [duty, logs] = await Promise.all([
    supabase.from("duty_logs" as never).select("id, duty_date, started_at, ended_at, location, auto_closed").eq("user_id", userId).gte("duty_date", from).order("started_at", { ascending: true }).limit(500),
    supabase.from("work_logs").select("log_date, hours, status").eq("user_id", userId).gte("log_date", from).lte("log_date", today).limit(2000),
  ]);
  if (duty.error) throw toError(duty.error, "Couldn't load the duty log. Please try again.");
  if (logs.error) throw toError(logs.error, "Couldn't load the duty log. Please try again.");

  const byDate = new Map<string, DutySession[]>();
  for (const r of (duty.data ?? []) as unknown as Row[]) {
    const list = byDate.get(r.duty_date) ?? [];
    list.push({ start: r.started_at, end: r.ended_at, location: asLocation(r.location), auto: r.auto_closed, seconds: seconds(r.started_at, r.ended_at) });
    byDate.set(r.duty_date, list);
  }
  const reported = new Map<string, number>();
  for (const l of logs.data) if (l.status !== "rejected") reported.set(l.log_date, (reported.get(l.log_date) ?? 0) + (l.hours ?? 0));

  const out: DutyDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i);
    const sessions = byDate.get(date) ?? [];
    const dutySeconds = sessions.reduce((n, s) => n + s.seconds, 0);
    const hours = Math.round((reported.get(date) ?? 0) * 100) / 100;
    if (sessions.length === 0 && hours === 0) continue; // nothing either way: not worth a row
    out.push({ date, sessions, dutySeconds, reportedHours: hours });
  }
  return out;
}
