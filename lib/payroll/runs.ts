import "server-only";
import { db, requireAdmin } from "@/lib/timesheet/auth";
import { addDays, daysInclusive, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, assertDate, assertId, toError } from "@/lib/timesheet/errors";
import { listHolidaysBetween } from "@/lib/timesheet/holidays";
import { isDayOff } from "@/lib/timesheet/holidayTypes";
import { displayName } from "@/lib/timesheet/people";
import type { Json } from "@/lib/supabase/types";
import { computePayslip, type Adjustment, type Component, type DayFact, type Payslip, type PayrollSettings, type Structure } from "./engine";
import { MAX_PAISE } from "./money";
import { isMonthKey, monthKeyOf, periodForMonth } from "./period";
import { audit, getPayrollSettings, listComponents } from "./server";
import type { PayrollSettingsData } from "./types";

// Payroll runs: working out every employee's pay for a month from APPROVED data, adjusting it, and moving the run through
// Draft -> Reviewed -> Finalized -> Paid. Admins only (every function starts with requireAdmin). Finalizing stores a
// snapshot of each payslip in the database; after that the numbers never change unless the run is reopened with a reason.

export type RunStatus = "draft" | "reviewed" | "finalized" | "paid";

export type RunSummary = {
  id: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  finalizedAt: string | null;
  paidOn: string | null;
  reopenCount: number;
  employees: number | null;
  netTotal: number | null;
};

export type AdjustmentRow = { id: string; kind: Adjustment["kind"]; label: string; amount: number };

export type RunRow = {
  userId: string;
  name: string;
  email: string;
  department: string;
  payslip: Payslip;
  adjustments: AdjustmentRow[];
  manualLopDays: number;
  /** Anything waiting for approval in this month that is not counted yet. */
  pending: string[];
};

export type RunDetail = {
  run: RunSummary;
  rows: RunRow[];
  runWarnings: string[];
  /** True once finalized or paid: the figures come from stored snapshots and cannot be edited. */
  locked: boolean;
  currency: string;
};

const asRunStatus = (s: string) => s as RunStatus;

// ---------------------------- Listing and creating runs ----------------------------

export async function listRuns(): Promise<RunSummary[]> {
  await requireAdmin();
  const supabase = await db();
  const [runs, slips] = await Promise.all([
    supabase.from("payroll_runs").select("*").order("period_start", { ascending: false }).limit(120),
    supabase.from("payslips").select("run_id, net_paise").is("superseded_at", null).limit(20000),
  ]);
  if (runs.error) throw toError(runs.error, "Couldn't load the payroll runs. Please try again.");
  if (slips.error) throw toError(slips.error, "Couldn't load the payroll runs. Please try again.");

  const totals = new Map<string, { n: number; net: number }>();
  for (const s of slips.data) {
    const t = totals.get(s.run_id) ?? { n: 0, net: 0 };
    t.n += 1;
    t.net += s.net_paise;
    totals.set(s.run_id, t);
  }
  return runs.data.map((r) => {
    const t = totals.get(r.id);
    return {
      id: r.id,
      month: monthKeyOf(r.period_end),
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: asRunStatus(r.status),
      finalizedAt: r.finalized_at,
      paidOn: r.paid_on,
      reopenCount: r.reopen_count,
      employees: t?.n ?? null,
      netTotal: t?.net ?? null,
    };
  });
}

export async function createRun(month: string): Promise<string> {
  if (!isMonthKey(month)) throw new TimesheetError("Choose a month.");
  await requireAdmin();
  const settings = await getPayrollSettings();
  const { start, end } = periodForMonth(month, settings.cycleStartDay);
  if (end > addDays(todayInOffice(), 62)) throw new TimesheetError("That month is too far in the future.");

  const supabase = await db();
  const { data, error } = await supabase.from("payroll_runs").insert({ period_start: start, period_end: end, status: "draft" }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new TimesheetError("There is already a payroll run for that month.");
    throw toError(error, "Couldn't create the payroll run. Please try again.");
  }
  await audit("run_created", "payroll_run", data.id, `Created the run for ${month}`);
  return data.id;
}

// ---------------------------- Gathering the approved facts ----------------------------

const isoWeekday = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

function dateRange(from: string, to: string, clipFrom: string, clipTo: string): string[] {
  const start = from > clipFrom ? from : clipFrom;
  const end = to < clipTo ? to : clipTo;
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

type Employee = { id: string; name: string; email: string; department: string; joinedOn: string; leftOn: string | null };

async function computeRows(
  run: { id: string; period_start: string; period_end: string },
  settings: PayrollSettingsData,
  components: Component[]
): Promise<{ rows: RunRow[]; runWarnings: string[] }> {
  const supabase = await db();
  const { period_start: start, period_end: end } = run;

  const [people, details, structures, hours, requests, compEarned, compOpen, pendingLogs, pendingReq, adjustments, inputs, holidays] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").order("full_name", { ascending: true }),
    supabase.from("employee_details").select("user_id, joined_on, left_on, department"),
    supabase.from("salary_structures").select("user_id, effective_from, basic_paise, hra_paise, allowances_paise, deductions_paise").lte("effective_from", end).order("effective_from", { ascending: false }).limit(20000),
    supabase.from("work_logs").select("user_id, log_date, hours").eq("status", "approved").gte("log_date", start).lte("log_date", end).limit(50000),
    supabase.from("requests").select("user_id, type, comp_off, from_date, to_date").eq("status", "approved").lte("from_date", end).gte("to_date", start).limit(20000),
    supabase.from("comp_off_requests").select("user_id, work_date").eq("status", "approved").gte("work_date", start).lte("work_date", end).limit(20000),
    supabase.from("comp_off_requests").select("user_id, work_date").or("status.eq.pending,needs_reapproval.eq.true").gte("work_date", start).lte("work_date", end).limit(20000),
    supabase.from("work_logs").select("user_id").eq("status", "pending").gte("log_date", start).lte("log_date", end).limit(50000),
    supabase.from("requests").select("user_id").eq("status", "pending").lte("from_date", end).gte("to_date", start).limit(20000),
    supabase.from("payroll_adjustments").select("id, user_id, kind, label, amount_paise").eq("run_id", run.id).order("created_at", { ascending: true }),
    supabase.from("payroll_run_inputs").select("user_id, manual_lop_days").eq("run_id", run.id),
    listHolidaysBetween(start, end).catch(() => []),
  ]);
  for (const r of [people, details, structures, hours, requests, compEarned, compOpen, pendingLogs, pendingReq, adjustments, inputs]) {
    if (r.error) throw toError(r.error, "Couldn't gather the payroll data. Please try again.");
  }

  const holidaySet = new Set(holidays.filter((h) => isDayOff(h.type)).map((h) => h.date));
  const detailBy = new Map(details.data!.map((d) => [d.user_id, d]));

  const hoursBy = new Map<string, number>(); // "user|date" -> hundredths of an hour
  for (const l of hours.data!) {
    const key = `${l.user_id}|${l.log_date}`;
    hoursBy.set(key, (hoursBy.get(key) ?? 0) + Math.round((l.hours ?? 0) * 100));
  }
  const leaveBy = new Set<string>();
  const compLeaveBy = new Set<string>();
  const wfhBy = new Set<string>();
  for (const r of requests.data!) {
    for (const d of dateRange(r.from_date, r.to_date, start, end)) {
      const key = `${r.user_id}|${d}`;
      if (r.type === "wfh") wfhBy.add(key);
      else if (r.comp_off) compLeaveBy.add(key);
      else leaveBy.add(key);
    }
  }
  const earnedBy = new Set(compEarned.data!.map((c) => `${c.user_id}|${c.work_date}`));
  const openBy = new Set(compOpen.data!.map((c) => `${c.user_id}|${c.work_date}`));

  const pendingCount = (rows: { user_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const pLogs = pendingCount(pendingLogs.data!);
  const pReq = pendingCount(pendingReq.data!);
  const pComp = pendingCount(compOpen.data!);

  const structureBy = new Map<string, Structure>();
  for (const s of structures.data!) {
    if (!structureBy.has(s.user_id)) {
      structureBy.set(s.user_id, { basic: s.basic_paise, hra: s.hra_paise, allowances: s.allowances_paise, deductions: s.deductions_paise });
    }
  }
  const adjBy = new Map<string, AdjustmentRow[]>();
  for (const a of adjustments.data!) {
    const list = adjBy.get(a.user_id) ?? [];
    list.push({ id: a.id, kind: a.kind as Adjustment["kind"], label: a.label, amount: a.amount_paise });
    adjBy.set(a.user_id, list);
  }
  const lopBy = new Map(inputs.data!.map((i) => [i.user_id, i.manual_lop_days]));

  const engineSettings: PayrollSettings = {
    payBasis: settings.payBasis,
    holidayWorkMode: settings.holidayWorkMode,
    overtimeEnabled: settings.overtimeEnabled,
    overtimeRateBp: settings.overtimeRateBp,
    holidayWorkRateBp: settings.holidayWorkRateBp,
    standardHundredths: Math.round(settings.standardHours * 100),
    overtimeBase: settings.overtimeBase,
    paidLeavePerMonth: settings.paidLeavePerMonth,
    roundNetToRupee: settings.roundNetToRupee,
  };

  const rows: RunRow[] = [];
  const runWarnings: string[] = [];
  const total = daysInclusive(start, end);

  for (const p of people.data!) {
    const d = detailBy.get(p.id);
    const emp: Employee = { id: p.id, name: displayName(p), email: p.email, department: d?.department ?? "", joinedOn: d?.joined_on ?? p.created_at.slice(0, 10), leftOn: d?.left_on ?? null };
    // Only people employed at some point in this month.
    if (emp.joinedOn > end || (emp.leftOn !== null && emp.leftOn < start)) continue;

    const days: DayFact[] = [];
    for (let i = 0; i < total; i++) {
      const date = addDays(start, i);
      const key = `${p.id}|${date}`;
      days.push({
        date,
        weekOff: settings.weeklyOffDays.includes(isoWeekday(date)),
        holiday: holidaySet.has(date),
        leave: leaveBy.has(key),
        compOffLeave: compLeaveBy.has(key),
        wfh: wfhBy.has(key),
        hoursHundredths: hoursBy.get(key) ?? 0,
        compOffEarned: earnedBy.has(key),
        compOffPending: openBy.has(key),
      });
    }

    const adj = adjBy.get(p.id) ?? [];
    const payslip = computePayslip({
      period: { start, end },
      settings: engineSettings,
      structure: structureBy.get(p.id) ?? null,
      components,
      employment: { joinedOn: emp.joinedOn, leftOn: emp.leftOn },
      days,
      adjustments: adj.map((a) => ({ kind: a.kind, label: a.label, amount: a.amount })),
      manualLopDays: lopBy.get(p.id) ?? 0,
    });

    const pending: string[] = [];
    if (pLogs.get(p.id)) pending.push(`${pLogs.get(p.id)} time ${pLogs.get(p.id) === 1 ? "log" : "logs"}`);
    if (pReq.get(p.id)) pending.push(`${pReq.get(p.id)} leave or WFH ${pReq.get(p.id) === 1 ? "request" : "requests"}`);
    if (pComp.get(p.id)) pending.push(`${pComp.get(p.id)} comp-off ${pComp.get(p.id) === 1 ? "request" : "requests"}`);

    rows.push({ userId: p.id, name: emp.name, email: emp.email, department: emp.department, payslip, adjustments: adj, manualLopDays: lopBy.get(p.id) ?? 0, pending });
  }

  const withPending = rows.filter((r) => r.pending.length > 0);
  if (withPending.length > 0) {
    runWarnings.push(`${withPending.length} ${withPending.length === 1 ? "employee has" : "employees have"} approvals still waiting this month. Only approved items are counted, so decide them first if they should be included.`);
  }
  const noStructure = rows.filter((r) => !structureBy.has(r.userId));
  if (noStructure.length > 0) runWarnings.push(`${noStructure.length} ${noStructure.length === 1 ? "employee has" : "employees have"} no salary structure and will get no salary.`);
  if (rows.length === 0) runWarnings.push("No employee was employed during this month.");
  return { rows, runWarnings };
}

function enabledComponents(all: Awaited<ReturnType<typeof listComponents>>): Component[] {
  return all.map((c) => ({ code: c.code, name: c.name, kind: c.kind, calc: c.calc, amount: c.amount, percentBp: c.percentBp, percentOf: c.percentOf, enabled: c.enabled }));
}

// ---------------------------- Opening a run ----------------------------

export async function getRunDetail(runId: string): Promise<RunDetail> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const { data: run, error } = await supabase.from("payroll_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw toError(error, "Couldn't load the payroll run. Please try again.");
  if (!run) throw new TimesheetError("That payroll run doesn't exist.");

  const settings = await getPayrollSettings();
  const summary: RunSummary = {
    id: run.id,
    month: monthKeyOf(run.period_end),
    periodStart: run.period_start,
    periodEnd: run.period_end,
    status: asRunStatus(run.status),
    finalizedAt: run.finalized_at,
    paidOn: run.paid_on,
    reopenCount: run.reopen_count,
    employees: null,
    netTotal: null,
  };

  if (summary.status === "finalized" || summary.status === "paid") {
    // Locked: show exactly what was stored, whatever the settings or data say now.
    const { data: slips, error: slipError } = await supabase
      .from("payslips")
      .select("user_id, snapshot, net_paise")
      .eq("run_id", runId)
      .is("superseded_at", null)
      .limit(5000);
    if (slipError) throw toError(slipError, "Couldn't load the payslips. Please try again.");
    const rows: RunRow[] = slips
      .map((s) => {
        const snap = s.snapshot as unknown as StoredSnapshot;
        return {
          userId: s.user_id,
          name: snap.employee.name,
          email: snap.employee.email,
          department: snap.employee.department,
          payslip: snap.payslip,
          adjustments: snap.adjustments.map((a, i) => ({ id: `${s.user_id}-${i}`, kind: a.kind, label: a.label, amount: a.amount })),
          manualLopDays: snap.manualLopDays,
          pending: [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    summary.employees = rows.length;
    summary.netTotal = rows.reduce((n, r) => n + r.payslip.net, 0);
    return { run: summary, rows, runWarnings: [], locked: true, currency: slips[0] ? (slips[0].snapshot as unknown as StoredSnapshot).currency : settings.currency };
  }

  const components = enabledComponents(await listComponents());
  const { rows, runWarnings } = await computeRows(run, settings, components);
  summary.employees = rows.length;
  summary.netTotal = rows.reduce((n, r) => n + r.payslip.net, 0);
  await audit("viewed", "payroll_run", runId, `Opened the payroll run for ${summary.month}`);
  return { run: summary, rows, runWarnings, locked: false, currency: settings.currency };
}

/** What is stored for each finalized payslip. Everything needed to show it again exactly as it was. */
export type StoredSnapshot = {
  version: 1;
  employee: { name: string; email: string; department: string; joinedOn: string; leftOn: string | null };
  period: { start: string; end: string; month: string };
  currency: string;
  settings: { payBasis: string; holidayWorkMode: string; overtimeEnabled: boolean; overtimeRateBp: number; holidayWorkRateBp: number; standardHours: number; paidLeavePerMonth: number; roundNetToRupee: boolean; weeklyOffDays: number[] };
  structure: (Structure & { effectiveFrom?: string }) | null;
  payslip: Payslip;
  adjustments: { kind: Adjustment["kind"]; label: string; amount: number }[];
  manualLopDays: number;
  generatedAt: string;
};

// ---------------------------- Adjustments and manual loss of pay (draft and reviewed runs) ----------------------------

async function openRun(runId: string): Promise<{ status: RunStatus }> {
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_runs").select("status").eq("id", runId).maybeSingle();
  if (error) throw toError(error, "Couldn't load the payroll run. Please try again.");
  if (!data) throw new TimesheetError("That payroll run doesn't exist.");
  const status = asRunStatus(data.status);
  if (status === "finalized" || status === "paid") throw new TimesheetError("This run is locked. Reopen it, with a reason, to change it.");
  if (status === "reviewed") {
    // Changing a reviewed run sends it back to draft, so a changed figure is never signed off by mistake.
    const { error: backError } = await supabase.rpc("payroll_review_run", { p_run: runId, p_reviewed: false });
    if (backError) throw toError(backError, "Couldn't update the run. Please try again.");
  }
  return { status };
}

export async function addAdjustment(runId: string, userId: string, input: { kind: Adjustment["kind"]; label: string; amount: number }): Promise<void> {
  assertId(runId, "payroll run");
  assertId(userId, "employee");
  if (!["bonus", "arrears", "reimbursement", "deduction"].includes(input.kind)) throw new TimesheetError("Choose bonus, arrears, reimbursement or deduction.");
  const label = String(input.label ?? "").trim();
  if (!label || label.length > 80) throw new TimesheetError("Enter a label of up to 80 characters.");
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount >= MAX_PAISE) throw new TimesheetError("Enter an amount greater than zero.");
  const admin = await requireAdmin();
  await openRun(runId);
  const supabase = await db();
  const { error } = await supabase.from("payroll_adjustments").insert({ run_id: runId, user_id: userId, kind: input.kind, label, amount_paise: input.amount, created_by: admin.id });
  if (error) throw toError(error, "Couldn't save the adjustment. Please try again.");
  await audit("adjustment_added", "payroll_run", runId, `Added a ${input.kind} for an employee`);
}

export async function deleteAdjustment(runId: string, adjustmentId: string): Promise<void> {
  assertId(runId, "payroll run");
  assertId(adjustmentId, "adjustment");
  await requireAdmin();
  await openRun(runId);
  const supabase = await db();
  const { error } = await supabase.from("payroll_adjustments").delete().eq("id", adjustmentId).eq("run_id", runId);
  if (error) throw toError(error, "Couldn't remove the adjustment. Please try again.");
  await audit("adjustment_removed", "payroll_run", runId, "Removed an adjustment");
}

export async function setManualLop(runId: string, userId: string, days: number): Promise<void> {
  assertId(runId, "payroll run");
  assertId(userId, "employee");
  if (!Number.isInteger(days) || days < 0 || days > 31) throw new TimesheetError("Enter whole days from 0 to 31.");
  await requireAdmin();
  await openRun(runId);
  const supabase = await db();
  const { error } = await supabase.from("payroll_run_inputs").upsert({ run_id: runId, user_id: userId, manual_lop_days: days }, { onConflict: "run_id,user_id" });
  if (error) throw toError(error, "Couldn't save the loss of pay days. Please try again.");
  await audit("lop_changed", "payroll_run", runId, "Changed the manual loss of pay days for an employee");
}

// ---------------------------- Moving a run through the workflow ----------------------------

export async function setReviewed(runId: string, reviewed: boolean): Promise<void> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.rpc("payroll_review_run", { p_run: runId, p_reviewed: reviewed });
  if (error) throw toError(error, "Couldn't update the run. Please try again.");
}

/** Work the figures out again from the approved data right now, store a snapshot of each payslip, and lock the run. */
export async function finalizeRun(runId: string): Promise<number> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const { data: run, error } = await supabase.from("payroll_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw toError(error, "Couldn't load the payroll run. Please try again.");
  if (!run) throw new TimesheetError("That payroll run doesn't exist.");
  if (run.status !== "reviewed") throw new TimesheetError("Mark the run as reviewed before finalizing it.");

  const settings = await getPayrollSettings();
  const components = enabledComponents(await listComponents());
  const { rows } = await computeRows(run, settings, components);
  if (rows.length === 0) throw new TimesheetError("There are no employees to pay for this month.");

  const { data: details } = await supabase.from("employee_details").select("user_id, joined_on, left_on");
  const detailBy = new Map((details ?? []).map((d) => [d.user_id, d]));
  const { data: structures } = await supabase.from("salary_structures").select("user_id, effective_from, basic_paise, hra_paise, allowances_paise, deductions_paise").lte("effective_from", run.period_end).order("effective_from", { ascending: false }).limit(20000);
  const structureBy = new Map<string, Structure & { effectiveFrom: string }>();
  for (const s of structures ?? []) {
    if (!structureBy.has(s.user_id)) structureBy.set(s.user_id, { basic: s.basic_paise, hra: s.hra_paise, allowances: s.allowances_paise, deductions: s.deductions_paise, effectiveFrom: s.effective_from });
  }

  const now = new Date().toISOString();
  const payload = rows.map((r) => {
    const d = detailBy.get(r.userId);
    const snapshot: StoredSnapshot = {
      version: 1,
      employee: { name: r.name, email: r.email, department: r.department, joinedOn: d?.joined_on ?? "", leftOn: d?.left_on ?? null },
      period: { start: run.period_start, end: run.period_end, month: monthKeyOf(run.period_end) },
      currency: settings.currency,
      settings: {
        payBasis: settings.payBasis,
        holidayWorkMode: settings.holidayWorkMode,
        overtimeEnabled: settings.overtimeEnabled,
        overtimeRateBp: settings.overtimeRateBp,
        holidayWorkRateBp: settings.holidayWorkRateBp,
        standardHours: settings.standardHours,
        paidLeavePerMonth: settings.paidLeavePerMonth,
        roundNetToRupee: settings.roundNetToRupee,
        weeklyOffDays: settings.weeklyOffDays,
      },
      structure: structureBy.get(r.userId) ?? null,
      payslip: r.payslip,
      adjustments: r.adjustments.map((a) => ({ kind: a.kind, label: a.label, amount: a.amount })),
      manualLopDays: r.manualLopDays,
      generatedAt: now,
    };
    return {
      user_id: r.userId,
      gross: r.payslip.gross,
      deductions: r.payslip.totalDeductions,
      net: r.payslip.net,
      payable_days: r.payslip.payableDays,
      lop_days: r.payslip.lopDays,
      currency: settings.currency,
      snapshot,
    };
  });

  const { data: count, error: rpcError } = await supabase.rpc("payroll_finalize_run", { p_run: runId, p_payslips: payload as unknown as Json });
  if (rpcError) throw toError(rpcError, "Couldn't finalize the run. Please try again.");
  return count ?? payload.length;
}

export async function markPaid(runId: string, paidOn: string): Promise<void> {
  assertId(runId, "payroll run");
  const date = assertDate(paidOn, "payment date");
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.rpc("payroll_mark_paid", { p_run: runId, p_paid_on: date });
  if (error) throw toError(error, "Couldn't mark the run as paid. Please try again.");
}

export async function reopenRun(runId: string, reason: string): Promise<void> {
  assertId(runId, "payroll run");
  const why = String(reason ?? "").trim();
  if (why.length < 3 || why.length > 300) throw new TimesheetError("Write a reason for reopening, from 3 to 300 characters.");
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.rpc("payroll_reopen_run", { p_run: runId, p_reason: why });
  if (error) throw toError(error, "Couldn't reopen the run. Please try again.");
}

export async function deleteDraftRun(runId: string): Promise<void> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_runs").delete().eq("id", runId).eq("status", "draft").select("id");
  if (error) throw toError(error, "Couldn't delete the run. Please try again.");
  if (!data?.length) throw new TimesheetError("Only a draft run can be deleted.");
  await audit("run_deleted", "payroll_run", runId, "Deleted a draft run");
}
