import "server-only";
import { db, requireAdmin, requireApprover } from "./auth";
import { computeBalance, type CompOffBalance } from "./compOffCore";
import { loadLedger } from "./compOff";
import { monthRange, todayInOffice } from "./dates";
import { TimesheetError, assertId, toError } from "./errors";
import { offDatesBetween } from "./holidays";
import { isDayPart, isLeaveKind, leaveDays, paidLeaveStatus, sumDays, type DayPart, type LeaveDay, type LeaveKind, type PaidMonth } from "./leaveCore";
import { logError } from "./log";
import { displayName } from "./people";
import { listApprovedLeaveBetween } from "./admin";
import { listAllRequests } from "./requests";

// The admin's Approvals page: leave and work-from-home requests with what an approval would do (paid leave left, comp-off
// balance), and the decision itself. Admins decide for everyone; a manager only for their direct reports (the database enforces
// that). Balances for all employees (loadBalances) are admin only.

const DEFAULT_QUOTA = 2;

type Owner = { full_name: string | null; email: string } | null;

export type PendingRequest = {
  id: string;
  userId: string;
  name: string;
  email: string;
  type: "leave" | "wfh";
  from: string;
  to: string;
  part: DayPart;
  reason: string;
  createdAt: string;
  /** Working days the request spends (weekends and holidays are free). */
  days: LeaveDay[];
  total: number;
  /** Leave only: the paid leave allowance for each month the dates touch. */
  paid: PaidMonth[];
  /** Leave only: the comp-off balance now, and what it would be if this were taken as comp-off. */
  compOff: { now: number; after: number; owedAfter: number } | null;
  /** Other people who are on approved leave on these dates. */
  alsoOff: string[];
};

export type LeaveSettings = { quota: number };

async function paidQuota(): Promise<number> {
  try {
    // A database function, so managers (who can't read the payroll settings) get the allowance too.
    const supabase = await db();
    const { data, error } = await supabase.rpc("paid_leave_quota" as never);
    if (error) throw error;
    const n = Number(data);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUOTA;
  } catch (e) {
    logError("approvals: paid leave allowance", e);
    return DEFAULT_QUOTA;
  }
}

/** Paid leave already taken, per person per month. Approved paid leave, plus older approved leave that had no decision (it used the allowance). */
async function paidUsage(userIds: string[] | "all", from: string, to: string, off: ReadonlySet<string>): Promise<Map<string, Map<string, number>>> {
  const supabase = await db();
  let q = supabase
    .from("requests")
    .select("user_id, from_date, to_date, day_part, leave_kind, comp_off")
    .eq("type", "leave")
    .eq("status", "approved")
    .lte("from_date", to)
    .gte("to_date", from);
  if (userIds !== "all") q = q.in("user_id", userIds);
  const { data, error } = await q.limit(5000);
  if (error) throw toError(error, "Couldn't load paid leave. Please try again.");
  const out = new Map<string, Map<string, number>>();
  for (const r of data) {
    const counts = r.leave_kind === "paid" || (r.leave_kind === null && !r.comp_off);
    if (!counts) continue;
    const m = out.get(r.user_id) ?? new Map<string, number>();
    for (const d of leaveDays(r.from_date, r.to_date, isDayPart(r.day_part) ? r.day_part : "full", off)) m.set(d.date.slice(0, 7), (m.get(d.date.slice(0, 7)) ?? 0) + d.days);
    out.set(r.user_id, m);
  }
  return out;
}

const monthStart = (ym: string) => `${ym}-01`;
// The real last day of the month ("2026-11-31" is not a date and the database refuses it).
const monthEnd = (ym: string) => monthRange(`${ym}-01`).end;

export async function loadPendingRequests(): Promise<{ rows: PendingRequest[]; quota: number }> {
  const admin = await requireApprover();
  const requests = (await listAllRequests("pending", 100)).filter((r) => r.user_id !== admin.id);
  const quota = await paidQuota();
  if (requests.length === 0) return { rows: [], quota };

  const dates = requests.flatMap((r) => [r.from_date, r.to_date]).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const off = new Set(await offDatesBetween(first, last).catch(() => [] as string[]));
  const leaveUsers = [...new Set(requests.filter((r) => r.type === "leave").map((r) => r.user_id))];

  const [usage, ledger, cover] = await Promise.all([
    leaveUsers.length ? paidUsage(leaveUsers, monthStart(first.slice(0, 7)), monthEnd(last.slice(0, 7)), off) : new Map<string, Map<string, number>>(),
    leaveUsers.length ? loadLedger(leaveUsers) : null,
    listApprovedLeaveBetween(first, last).catch(() => []),
  ]);
  const today = todayInOffice();

  const rows = requests.map((r): PendingRequest => {
    const part: DayPart = isDayPart(r.day_part) ? r.day_part : "full";
    const days = leaveDays(r.from_date, r.to_date, part, off);
    const isLeave = r.type === "leave";
    let compOff: PendingRequest["compOff"] = null;
    if (isLeave && ledger) {
      const credits = ledger.creditsBy.get(r.user_id) ?? [];
      const uses = ledger.usesBy.get(r.user_id) ?? [];
      const now = computeBalance(credits, uses, today);
      const after = computeBalance(credits, [...uses, ...days], today);
      compOff = { now: now.balance, after: after.balance, owedAfter: after.shortfall };
    }
    return {
      id: r.id,
      userId: r.user_id,
      name: displayName(r.owner),
      email: r.owner?.email ?? "",
      type: r.type,
      from: r.from_date,
      to: r.to_date,
      part,
      reason: r.reason ?? "",
      createdAt: r.created_at,
      days,
      total: sumDays(days),
      paid: isLeave ? paidLeaveStatus(quota, usage.get(r.user_id) ?? new Map(), days) : [],
      compOff,
      alsoOff: [...new Set(cover.filter((c) => c.user_id !== r.user_id && c.from_date <= r.to_date && c.to_date >= r.from_date).map((c) => displayName(c.owner as Owner)))].slice(0, 6),
    };
  });
  return { rows, quota };
}

export type DecisionInput = { id: string; decision: "approved" | "rejected"; kind?: LeaveKind | null; note?: string };

/**
 * Decide a request. Approving leave needs the admin's choice of paid, comp-off or unpaid; work from home has no kind.
 * Paid leave over the monthly allowance and comp-off with too little credit are both allowed (the page warns first): the extra
 * paid days are simply paid, and missing comp-off is a debt the person pays back by working a weekend or holiday.
 */
export async function decideRequestWithKind(input: DecisionInput): Promise<void> {
  assertId(input.id, "request");
  if (input.decision !== "approved" && input.decision !== "rejected") throw new TimesheetError("Please choose approve or reject.");
  const admin = await requireApprover();
  const supabase = await db();

  const { data: current, error: readError } = await supabase.from("requests").select("user_id, type, status").eq("id", input.id).maybeSingle();
  if (readError) throw toError(readError, "Couldn't save your decision. Please try again.");
  if (!current) throw new TimesheetError("That request no longer exists. Please refresh.");
  if (current.user_id === admin.id) throw new TimesheetError("You cannot decide your own request.");

  let kind: LeaveKind | null = null;
  if (input.decision === "approved" && current.type === "leave") {
    if (!isLeaveKind(input.kind)) throw new TimesheetError("Choose what kind of leave this is: paid, comp-off or unpaid.");
    kind = input.kind;
  }

  const { data, error } = await supabase
    .from("requests")
    .update({
      status: input.decision,
      leave_kind: kind,
      comp_off: kind === "comp_off",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: input.note?.trim().slice(0, 500) || null,
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw toError(error, "Couldn't save your decision. Please try again.");
  if (!data) throw new TimesheetError("Only pending requests can be approved or rejected.");
}

// ---------------------------- Balances ----------------------------

export type BalanceRow = {
  userId: string;
  name: string;
  email: string;
  paid: { quota: number; used: number; left: number };
  compOff: CompOffBalance;
  /** Approved leave this year, by kind (days). */
  year: { paid: number; compOff: number; unpaid: number };
};

/** Paid leave this month and comp-off for every employee. */
export async function loadBalances(): Promise<{ rows: BalanceRow[]; quota: number; month: string }> {
  await requireAdmin();
  const supabase = await db();
  const today = todayInOffice();
  const month = today.slice(0, 7);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const quota = await paidQuota();
  const off = new Set(await offDatesBetween(yearStart, `${today.slice(0, 4)}-12-31`).catch(() => [] as string[]));

  const [people, leave, ledger] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, status").limit(5000),
    supabase.from("requests").select("user_id, from_date, to_date, day_part, leave_kind, comp_off").eq("type", "leave").eq("status", "approved").gte("to_date", yearStart).limit(10000),
    loadLedger("all"),
  ]);
  if (people.error) throw toError(people.error, "Couldn't load balances. Please try again.");
  if (leave.error) throw toError(leave.error, "Couldn't load balances. Please try again.");

  const yearBy = new Map<string, { paid: number; compOff: number; unpaid: number }>();
  const usedBy = new Map<string, number>();
  for (const r of leave.data) {
    const kind = r.leave_kind === "comp_off" || (r.leave_kind === null && r.comp_off) ? "comp_off" : r.leave_kind === "unpaid" ? "unpaid" : "paid";
    const y = yearBy.get(r.user_id) ?? { paid: 0, compOff: 0, unpaid: 0 };
    for (const d of leaveDays(r.from_date, r.to_date, isDayPart(r.day_part) ? r.day_part : "full", off)) {
      if (d.date < yearStart) continue;
      if (kind === "comp_off") y.compOff += d.days;
      else if (kind === "unpaid") y.unpaid += d.days;
      else {
        y.paid += d.days;
        if (d.date.startsWith(month)) usedBy.set(r.user_id, (usedBy.get(r.user_id) ?? 0) + d.days);
      }
    }
    yearBy.set(r.user_id, y);
  }

  const rows = people.data
    .filter((p) => p.status !== "disabled" && (p.role === "employee" || p.role === "manager"))
    .map((p): BalanceRow => {
      const used = usedBy.get(p.id) ?? 0;
      return {
        userId: p.id,
        name: displayName(p),
        email: p.email,
        paid: { quota, used, left: Math.max(0, Math.round((quota - used) * 100) / 100) },
        compOff: computeBalance(ledger.creditsBy.get(p.id) ?? [], ledger.usesBy.get(p.id) ?? [], today),
        year: yearBy.get(p.id) ?? { paid: 0, compOff: 0, unpaid: 0 },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, quota, month };
}

// ---------------------------- One person's balances (for a manager's team page) ----------------------------

export type MemberBalances = { quota: number; paidUsed: number; paidLeft: number; compOff: CompOffBalance };

/** Paid leave this month and comp-off for one person. Works for an admin, or a manager looking at their own team member. */
export async function memberBalances(userId: string): Promise<MemberBalances> {
  assertId(userId, "person");
  await requireApprover();
  const today = todayInOffice();
  const month = today.slice(0, 7);
  const quota = await paidQuota();
  const off = new Set(await offDatesBetween(monthStart(month), monthEnd(month)).catch(() => [] as string[]));
  const [usage, ledger] = await Promise.all([paidUsage([userId], monthStart(month), monthEnd(month), off), loadLedger([userId])]);
  const used = usage.get(userId)?.get(month) ?? 0;
  return {
    quota,
    paidUsed: used,
    paidLeft: Math.max(0, Math.round((quota - used) * 100) / 100),
    compOff: computeBalance(ledger.creditsBy.get(userId) ?? [], ledger.usesBy.get(userId) ?? [], today),
  };
}
