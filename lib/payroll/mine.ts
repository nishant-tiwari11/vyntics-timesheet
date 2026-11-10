import "server-only";
import { db, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError, assertId, toError } from "@/lib/timesheet/errors";
import { todayInOffice } from "@/lib/timesheet/dates";
import { isMonthKey } from "./period";
import type { StoredSnapshot } from "./runs";
import type { PayslipDetail, PayslipListItem, StructureView } from "./slipTypes";

// What an employee can read of payroll: THEIR OWN live (finalized or paid) payslips, and their own salary structure when
// the admin has switched that on. The person is always taken from the signed-in session, never from the address or the
// request. The database enforces the same thing with row level security, so a mistake here still could not show someone
// else's pay.

type Row = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  paid_on: string | null;
  gross_paise: number;
  deductions_paise: number;
  net_paise: number;
  payable_days: number;
  lop_days: number;
  currency: string;
};

const COLUMNS = "id, period_start, period_end, status, paid_on, gross_paise, deductions_paise, net_paise, payable_days, lop_days, currency";

const toItem = (r: Row): PayslipListItem => ({
  id: r.id,
  month: r.period_end.slice(0, 7),
  periodStart: r.period_start,
  periodEnd: r.period_end,
  status: r.status === "paid" ? "paid" : "finalized",
  paidOn: r.paid_on,
  gross: r.gross_paise,
  deductions: r.deductions_paise,
  net: r.net_paise,
  payableDays: r.payable_days,
  lopDays: r.lop_days,
  currency: r.currency,
});

/** Your payslips, newest first. Never a draft or preview: only payslips stored by finalizing a run exist here. */
export async function listMyPayslips(): Promise<PayslipListItem[]> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("payslips")
    .select(COLUMNS)
    .eq("user_id", me.id)
    .is("superseded_at", null)
    .order("period_end", { ascending: false })
    .limit(240);
  if (error) throw toError(error, "Couldn't load your payslips. Please try again.");
  return (data as Row[]).map(toItem);
}

function toDetail(item: PayslipListItem, snapshot: StoredSnapshot): PayslipDetail {
  const p = snapshot.payslip;
  return {
    ...item,
    employee: { name: snapshot.employee.name, email: snapshot.employee.email, department: snapshot.employee.department },
    earnings: p.earnings,
    deductionLines: p.deductions,
    roundingAdjustment: p.roundingAdjustment ?? 0,
    attendance: {
      baseDays: p.baseDays,
      workingDays: p.employedWorkingDays ?? p.workingDaysInPeriod,
      presentDays: p.presentDays ?? 0,
      wfhDays: p.wfhDays ?? 0,
      paidLeaveDays: p.paidLeaveDays,
      compOffLeaveDays: p.compOffLeaveDays,
      lopDays: p.lopDays,
      absentDays: p.absentDays,
      holidayWorkedDays: p.holidayWorkedDays ?? 0,
      compOffEarnedDays: p.compOffEarnedDays ?? 0,
      overtimeHours: p.overtimeHours,
    },
  };
}

/** One of your payslips by pay month ("2026-11"). Returns null when you have none for that month. */
export async function getMyPayslip(month: string): Promise<PayslipDetail | null> {
  if (!isMonthKey(month)) throw new TimesheetError("Choose a valid month.");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("payslips")
    .select(`${COLUMNS}, snapshot`)
    .eq("user_id", me.id)
    .is("superseded_at", null)
    .gte("period_end", `${month}-01`)
    .lte("period_end", `${month}-31`)
    .maybeSingle();
  if (error) throw toError(error, "Couldn't load your payslip. Please try again.");
  if (!data) return null;
  return toDetail(toItem(data as Row), data.snapshot as unknown as StoredSnapshot);
}

/** Several of your payslips with full detail (for the PDF of a whole year). */
export async function getMyPayslipsForYear(year: number): Promise<PayslipDetail[]> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TimesheetError("Choose a valid year.");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("payslips")
    .select(`${COLUMNS}, snapshot`)
    .eq("user_id", me.id)
    .is("superseded_at", null)
    .gte("period_end", `${year}-01-01`)
    .lte("period_end", `${year}-12-31`)
    .order("period_end", { ascending: true });
  if (error) throw toError(error, "Couldn't load your payslips. Please try again.");
  return data.map((r) => toDetail(toItem(r as Row), r.snapshot as unknown as StoredSnapshot));
}

/** Your current salary breakdown, only when the admin shares it. Otherwise null (and the database returns nothing anyway). */
export async function getMyStructure(currency: string): Promise<StructureView | null> {
  const me = await requireUser();
  const supabase = await db();
  const { data: visible } = await supabase.rpc("payroll_structure_visible");
  if (visible !== true) return null;
  const { data, error } = await supabase
    .from("salary_structures")
    .select("effective_from, basic_paise, hra_paise, allowances_paise, deductions_paise")
    .eq("user_id", me.id)
    .lte("effective_from", todayInOffice())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toError(error, "Couldn't load your salary structure. Please try again.");
  if (!data) return null;
  const monthlyGross = data.basic_paise + data.hra_paise + data.allowances_paise;
  return {
    effectiveFrom: data.effective_from,
    basic: data.basic_paise,
    hra: data.hra_paise,
    allowances: data.allowances_paise,
    deductions: data.deductions_paise,
    monthlyGross,
    annualGross: monthlyGross * 12,
    currency,
  };
}

/** Is the salary structure shared with employees? (An employee can't read the settings table, so this asks a function.) */
export async function structureShared(): Promise<boolean> {
  await requireUser();
  const supabase = await db();
  const { data } = await supabase.rpc("payroll_structure_visible");
  return data === true;
}

/** Write one of your own views or downloads to the audit log (who and when). Failing never blocks the page. */
export async function logSelf(action: "viewed_payslip" | "downloaded_payslip" | "downloaded_year" | "viewed_my_salary", payslipId: string | null): Promise<void> {
  try {
    await requireUser();
    if (payslipId) assertId(payslipId, "payslip");
    const supabase = await db();
    await supabase.rpc("payroll_log_self", { p_action: action, p_payslip: payslipId });
  } catch {
    // Audit logging must never break viewing your own payslip.
  }
}
