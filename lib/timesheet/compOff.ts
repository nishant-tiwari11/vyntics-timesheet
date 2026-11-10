import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import {
  DEFAULT_SETTINGS,
  computeBalance,
  creditForHours,
  daysText,
  daysSpent,
  type CompOffBalance,
  type CompOffCredit,
  type CompOffRequest,
  type CompOffSettings,
  type CompOffStatus,
} from "./compOffCore";
import { isWeekend, todayInOffice } from "./dates";
import { TimesheetError, assertDate, assertId, toError } from "./errors";
import { listHolidaysBetween } from "./holidays";
import { isDayOff } from "./holidayTypes";
import { listMyHoursByDate } from "./logs";
import { displayName } from "./people";

// The database checks the same earning rules (supabase/step17_comp_off.sql) and decides who may change what.
// The checks here come first so the person gets a clear message; the leave balance is checked only here.

type Row = {
  id: string;
  user_id: string;
  work_date: string;
  hours_worked: number;
  reason: string | null;
  status: string;
  credit: number;
  expires_on: string | null;
  admin_note: string | null;
  created_at: string;
  auto_created?: boolean;
  needs_reapproval?: boolean;
  proposed_hours?: number | null;
  proposed_credit?: number | null;
  owner?: { full_name: string | null; email: string } | null;
  entry?: { content: string; project: string | null; hours: number | null } | null;
};

const toRequest = (r: Row): CompOffRequest => ({
  id: r.id,
  userId: r.user_id,
  name: r.owner ? displayName(r.owner) : "",
  workDate: r.work_date,
  hours: r.hours_worked,
  reason: r.reason ?? "",
  status: r.status as CompOffStatus,
  credit: r.credit,
  expiresOn: r.expires_on,
  adminNote: r.admin_note ?? "",
  createdAt: r.created_at,
  auto: r.auto_created === true,
  entry: r.entry ? { task: r.entry.content, project: r.entry.project ?? "", hours: r.entry.hours } : null,
  needsReapproval: r.needs_reapproval === true,
  proposedHours: r.proposed_hours ?? null,
  proposedCredit: r.proposed_credit ?? null,
});

// ---------------------------- Settings ----------------------------

export async function getSettings(): Promise<CompOffSettings> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("comp_off_settings").select("*").maybeSingle();
  if (error) throw toError(error, "Couldn't load the comp-off settings. Please try again.");
  if (!data) return DEFAULT_SETTINGS;
  return { halfDayHours: data.half_day_hours, fullDayHours: data.full_day_hours, expiryDays: data.expiry_days, monthlyCap: data.monthly_cap };
}

export async function updateSettings(input: CompOffSettings): Promise<void> {
  const admin = await requireAdmin();
  const { halfDayHours, fullDayHours, expiryDays, monthlyCap } = input;
  if (![halfDayHours, fullDayHours, expiryDays, monthlyCap].every((n) => Number.isFinite(n))) {
    throw new TimesheetError("Enter a number in every box.");
  }
  if (halfDayHours <= 0 || halfDayHours > 24) throw new TimesheetError("Hours for a half day must be between 0 and 24.");
  if (fullDayHours < halfDayHours || fullDayHours > 24) throw new TimesheetError("Hours for a full day must be at least the half day hours, and at most 24.");
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 730) throw new TimesheetError("Expiry must be a whole number of days from 1 to 730.");
  if (monthlyCap < 0 || monthlyCap > 31) throw new TimesheetError("The monthly limit must be between 0 and 31 days (0 means no limit).");

  const supabase = await db();
  const { error } = await supabase
    .from("comp_off_settings")
    .update({ half_day_hours: halfDayHours, full_day_hours: fullDayHours, expiry_days: expiryDays, monthly_cap: monthlyCap, updated_by: admin.id, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw toError(error, "Couldn't save the settings. Please try again.");
}

// ---------------------------- Balance ----------------------------

/** Every day in the range that is a holiday or festival (not a working day). */
async function offSet(from: string, to: string): Promise<Set<string>> {
  const list = await listHolidaysBetween(from, to).catch(() => []);
  return new Set(list.filter((h) => isDayOff(h.type)).map((h) => h.date));
}

/** Credits and booked leave days for these people (an admin may ask for anyone; everyone else only for themselves). */
async function loadLedger(userIds: string[] | "all") {
  const supabase = await db();
  let credits = supabase.from("comp_off_requests").select("id, user_id, credit, expires_on").eq("status", "approved").not("expires_on", "is", null);
  let leave = supabase.from("requests").select("user_id, from_date, to_date").eq("comp_off", true).in("status", ["pending", "approved"]);
  if (userIds !== "all") {
    credits = credits.in("user_id", userIds);
    leave = leave.in("user_id", userIds);
  }
  const [c, l] = await Promise.all([credits.limit(5000), leave.limit(5000)]);
  if (c.error) throw toError(c.error, "Couldn't load comp-off. Please try again.");
  if (l.error) throw toError(l.error, "Couldn't load comp-off. Please try again.");

  const dates = l.data.flatMap((r) => [r.from_date, r.to_date]).sort();
  const off = dates.length ? await offSet(dates[0], dates[dates.length - 1]) : new Set<string>();

  const creditsBy = new Map<string, CompOffCredit[]>();
  for (const r of c.data) {
    const list = creditsBy.get(r.user_id) ?? [];
    list.push({ id: r.id, credit: r.credit, expiresOn: r.expires_on as string });
    creditsBy.set(r.user_id, list);
  }
  const usesBy = new Map<string, string[]>();
  for (const r of l.data) {
    const list = usesBy.get(r.user_id) ?? [];
    list.push(...daysSpent(r.from_date, r.to_date, off));
    usesBy.set(r.user_id, list);
  }
  return { creditsBy, usesBy };
}

export async function myBalance(): Promise<CompOffBalance> {
  const me = await requireUser();
  const { creditsBy, usesBy } = await loadLedger([me.id]);
  return computeBalance(creditsBy.get(me.id) ?? [], usesBy.get(me.id) ?? [], todayInOffice());
}

/**
 * Called when someone asks for comp-off leave: is there enough unexpired credit for these dates, with the days already
 * booked taken into account? Throws a clear message if not.
 */
export async function assertCanSpend(userId: string, from: string, to: string): Promise<void> {
  const { creditsBy, usesBy } = await loadLedger([userId]);
  const off = await offSet(from, to);
  const days = daysSpent(from, to, off);
  if (days.length === 0) throw new TimesheetError("Those dates are all weekends or holidays, so there is nothing to take comp-off for.");

  const credits = creditsBy.get(userId) ?? [];
  const today = todayInOffice();
  const before = computeBalance(credits, usesBy.get(userId) ?? [], today);
  const after = computeBalance(credits, [...(usesBy.get(userId) ?? []), ...days], today);
  if (after.shortfall > before.shortfall) {
    const lastCredit = credits.map((c) => c.expiresOn).sort().pop();
    const detail =
      before.available === 0 && before.expired > 0
        ? " Your earlier comp-off has expired."
        : lastCredit && to > lastCredit
          ? ` Comp-off can only be used up to its expiry date (${lastCredit}).`
          : "";
    throw new TimesheetError(
      `You have ${daysText(before.available)} of comp-off available, and this request needs ${daysText(days.length)}.${detail}`
    );
  }
}

// ---------------------------- Earning ----------------------------

export async function hoursOn(date: string): Promise<number> {
  const d = assertDate(date, "date");
  const byDate = await listMyHoursByDate(d, d);
  return byDate[d] ?? 0;
}

export async function listMine(): Promise<CompOffRequest[]> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("comp_off_requests").select("*").eq("user_id", me.id).order("work_date", { ascending: false }).limit(200);
  if (error) throw toError(error, "Couldn't load your comp-off requests. Please try again.");
  return data.map(toRequest);
}

export async function createRequest(input: { workDate: string; hours: number; reason: string }): Promise<void> {
  const date = assertDate(input.workDate, "date worked");
  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new TimesheetError("Enter the hours you worked, between 0 and 24.");
  const reason = String(input.reason ?? "").trim();
  if (reason.length > 500) throw new TimesheetError("Keep the reason to 500 characters or fewer.");

  const me = await requireUser();
  if (date > todayInOffice()) throw new TimesheetError("You can only ask for comp-off for a day you have already worked.");

  // Weekend, or a public holiday / festival from the Holidays list.
  if (!isWeekend(date)) {
    const off = await offSet(date, date);
    if (!off.has(date)) throw new TimesheetError("Comp-off can only be earned for work on a weekend, a public holiday or a festival day.");
  }

  const settings = await getSettings();
  if (creditForHours(hours, settings) === 0) {
    throw new TimesheetError(`Work at least ${settings.halfDayHours} hours for a half day of comp-off.`);
  }

  const supabase = await db();
  const { error } = await supabase.from("comp_off_requests").insert({ user_id: me.id, work_date: date, hours_worked: hours, reason: reason || null });
  if (error) {
    if (error.code === "23505") throw new TimesheetError("You already asked for comp-off for that day.");
    throw toError(error, "Couldn't send your request. Please try again.");
  }
}

export async function cancelRequest(id: string): Promise<void> {
  assertId(id, "request");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("comp_off_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw toError(error, "Couldn't cancel the request. Please try again.");
  if (!data) throw new TimesheetError("Only a pending request can be cancelled.");
}

// ---------------------------- Admin ----------------------------

export async function listAll(filter: "pending" | "all" = "pending"): Promise<CompOffRequest[]> {
  await requireAdmin();
  const supabase = await db();
  let query = supabase
    .from("comp_off_requests")
    .select("*, owner:profiles!comp_off_requests_user_id_fkey(full_name, email), entry:work_logs!comp_off_requests_timesheet_entry_id_fkey(content, project, hours)")
    .order("created_at", { ascending: false })
    .limit(200);
  // "Waiting" = new requests, plus approved ones whose time log changed and need a new decision.
  if (filter === "pending") query = query.or("status.eq.pending,needs_reapproval.eq.true");
  const { data, error } = await query;
  if (error) throw toError(error, "Couldn't load comp-off requests. Please try again.");
  return data.map((r) => toRequest(r as Row));
}

export async function decide(id: string, decision: "approved" | "rejected", note: string): Promise<void> {
  assertId(id, "request");
  if (decision !== "approved" && decision !== "rejected") throw new TimesheetError("Please choose approve or reject.");
  const admin = await requireAdmin();
  const supabase = await db();

  const { data: current, error: readError } = await supabase
    .from("comp_off_requests")
    .select("user_id, status, credit, needs_reapproval, proposed_credit")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw toError(readError, "Couldn't save your decision. Please try again.");
  if (!current) throw new TimesheetError("That request no longer exists. Please refresh.");
  if (current.user_id === admin.id) throw new TimesheetError("You cannot decide your own request.");

  // An approved request whose time log changed: approve the new amount, or keep the original.
  if (current.status === "approved" && current.needs_reapproval) {
    if (decision === "approved" && (current.proposed_credit ?? 0) < current.credit) {
      // Lowering or withdrawing a credit must never leave leave days that nothing pays for.
      const { creditsBy, usesBy } = await loadLedger([current.user_id]);
      const credits = (creditsBy.get(current.user_id) ?? []).map((c) => (c.id === id ? { ...c, credit: current.proposed_credit ?? 0 } : c));
      const today = todayInOffice();
      const uses = usesBy.get(current.user_id) ?? [];
      const before = computeBalance(creditsBy.get(current.user_id) ?? [], uses, today);
      const after = computeBalance(credits, uses, today);
      if (after.shortfall > before.shortfall) {
        throw new TimesheetError("This person has already booked leave with this comp-off, so it can't be reduced. Keep the original instead.");
      }
    }
    const { error: reError } = await supabase.rpc("comp_off_decide_reapproval", { p_id: id, p_approve: decision === "approved", p_note: note.trim().slice(0, 500) });
    if (reError) throw toError(reError, "Couldn't save your decision. Please try again.");
    return;
  }

  const { data, error } = await supabase
    .from("comp_off_requests")
    .update({ status: decision, admin_note: note.trim().slice(0, 500) || null })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw toError(error, "Couldn't save your decision. Please try again.");
  if (!data) throw new TimesheetError("Only pending requests can be approved or rejected.");
}

export type CompOffReportRow = { userId: string; name: string; email: string } & CompOffBalance;

/** Earned, used, expired and expiring soon for every employee who has any comp-off. */
export async function report(): Promise<CompOffReportRow[]> {
  await requireAdmin();
  const supabase = await db();
  const { creditsBy, usesBy } = await loadLedger("all");
  const ids = [...new Set([...creditsBy.keys(), ...usesBy.keys()])];
  if (ids.length === 0) return [];
  const { data: people, error } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  if (error) throw toError(error, "Couldn't load the report. Please try again.");

  const today = todayInOffice();
  return people
    .map((p) => ({
      userId: p.id,
      name: displayName(p),
      email: p.email,
      ...computeBalance(creditsBy.get(p.id) ?? [], usesBy.get(p.id) ?? [], today),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}


// ---------------------------- Day information, for the time log form and tables ----------------------------

export type DayInfo = {
  /** True on a weekend, public holiday or festival day. */
  isOff: boolean;
  /** "Week off", "Holiday: Diwali" or "". */
  label: string;
  /** Your comp-off request for that day, if there is one. */
  request: { status: CompOffStatus; credit: number; hours: number; needsReapproval: boolean } | null;
};

export async function dayInfo(date: string): Promise<DayInfo> {
  const d = assertDate(date, "date");
  const me = await requireUser();
  const holidays = (await listHolidaysBetween(d, d).catch(() => [])).filter((h) => isDayOff(h.type));
  const label = holidays.length > 0 ? `Holiday: ${holidays[0].name}` : isWeekend(d) ? "Week off" : "";

  const supabase = await db();
  const { data } = await supabase
    .from("comp_off_requests")
    .select("status, credit, hours_worked, needs_reapproval")
    .eq("user_id", me.id)
    .eq("work_date", d)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    isOff: label !== "",
    label,
    request: data ? { status: data.status as CompOffStatus, credit: data.credit, hours: data.hours_worked, needsReapproval: data.needs_reapproval } : null,
  };
}

/** The comp-off request status for each (person, day) in a range, to show next to time log entries. */
export async function requestsByDay(from: string, to: string): Promise<Record<string, { status: CompOffStatus; credit: number; needsReapproval: boolean }>> {
  assertDate(from, "start date");
  assertDate(to, "end date");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("comp_off_requests")
    .select("user_id, work_date, status, credit, needs_reapproval")
    .gte("work_date", from)
    .lte("work_date", to)
    .in("status", ["pending", "approved", "rejected"])
    .limit(1000);
  if (error) throw toError(error, "Couldn't load comp-off. Please try again.");
  const out: Record<string, { status: CompOffStatus; credit: number; needsReapproval: boolean }> = {};
  for (const r of data) out[`${r.user_id}|${r.work_date}`] = { status: r.status as CompOffStatus, credit: r.credit, needsReapproval: r.needs_reapproval };
  return out;
}
