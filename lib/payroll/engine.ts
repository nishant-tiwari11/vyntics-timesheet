// The payroll calculation for one employee for one pay month. A pure function: it reads nothing and writes nothing, so
// running it again with the same input always gives the same payslip (that is what makes recalculation safe and
// repeatable). Every amount is an integer number of paise; see money.ts.
//
// THE RULES (kept in one place, mirrored in the admin settings page):
//  * Only days inside the person's employment (joining date to leaving date) are counted; the rest is pro-rata.
//  * Weekly offs and public holidays are paid days. Paid leave and approved comp-off leave are paid days.
//  * A working day with approved leave beyond the paid-leave allowance is loss of pay (LOP).
//  * A working day with no timesheet hours, no leave and no work from home is an absent day, also unpaid.
//  * Payable days = days in the month (or working days, by setting) within employment, minus LOP and absent days.
//  * Basic, HRA and allowances are pro-rated by payable days. Fixed deductions in the salary structure are not.
//  * Work on a weekly off or holiday is EITHER paid (setting "pay") OR earns comp-off (setting "comp-off"), never both:
//    a day that already has approved comp-off credit is never paid.
//  * Every line is rounded half up to the paise, so the lines always add up exactly to the totals.

import { type Paise, mulDivRound, percentOf, proRate } from "./money";

export type PayrollSettings = {
  payBasis: "calendar_days" | "working_days";
  holidayWorkMode: "comp_off" | "pay";
  overtimeEnabled: boolean;
  /** 15000 = paid at 1.5 times the normal hourly rate. */
  overtimeRateBp: number;
  holidayWorkRateBp: number;
  /** Standard hours in a working day, in hundredths of an hour (800 = 8 hours). */
  standardHundredths: number;
  overtimeBase: "basic" | "gross";
  /** Approved leave days per month that are paid; the rest are loss of pay. */
  paidLeavePerMonth: number;
  roundNetToRupee: boolean;
};

export type Structure = { basic: Paise; hra: Paise; allowances: Paise; deductions: Paise };

export type Component = {
  code: string;
  name: string;
  kind: "earning" | "deduction";
  calc: "fixed" | "percent";
  amount: Paise;
  percentBp: number;
  percentOf: "basic" | "gross";
  enabled: boolean;
};

export type Adjustment = {
  kind: "bonus" | "arrears" | "reimbursement" | "deduction";
  label: string;
  amount: Paise;
};

/** What happened on one day, taken from approved data only. */
export type DayFact = {
  /** YYYY-MM-DD */
  date: string;
  weekOff: boolean;
  /** A public holiday or festival day. */
  holiday: boolean;
  /** Approved leave (not comp-off) covers this day. */
  leave: boolean;
  /** Approved leave paid for with comp-off days covers this day. */
  compOffLeave: boolean;
  wfh: boolean;
  /** Approved timesheet hours that day, in hundredths of an hour (850 = 8.5 hours). */
  hoursHundredths: number;
  /** An approved comp-off credit exists for work on this day. */
  compOffEarned: boolean;
  /** A comp-off request for this day is still waiting for a decision. */
  compOffPending: boolean;
};

export type EngineInput = {
  /** First and last day of the pay month, inclusive. */
  period: { start: string; end: string };
  settings: PayrollSettings;
  /** The salary structure in force for the month, or null if the person has none (every salary line is then zero). */
  structure: Structure | null;
  components: Component[];
  employment: { joinedOn: string; leftOn: string | null };
  /** One entry for every date from period.start to period.end. */
  days: DayFact[];
  adjustments: Adjustment[];
  /** Extra loss-of-pay days an admin adds for this month (an unreported absence, for example). */
  manualLopDays?: number;
};

export type Line = { code: string; label: string; amount: Paise };

export type Payslip = {
  periodDays: number;
  workingDaysInPeriod: number;
  employedDays: number;
  /** Days that count as paid after taking off LOP and absence (what the salary is pro-rated by). */
  payableDays: number;
  /** The days in the month that salary is divided across (calendar days or working days). */
  baseDays: number;
  lopDays: number;
  absentDays: number;
  paidLeaveDays: number;
  compOffLeaveDays: number;
  /** Working days the person was employed (the count 'present', leave and absence are taken from). */
  employedWorkingDays: number;
  /** Working days with approved timesheet hours or work from home. */
  presentDays: number;
  wfhDays: number;
  /** Weekly offs and holidays on which approved hours were worked. */
  holidayWorkedDays: number;
  /** Days off worked that already have approved comp-off credit. */
  compOffEarnedDays: number;
  overtimeHours: number;
  holidayWorkHours: number;
  earnings: Line[];
  deductions: Line[];
  gross: Paise;
  totalDeductions: Paise;
  roundingAdjustment: Paise;
  net: Paise;
  warnings: string[];
};

const hours = (hundredths: number) => hundredths / 100;

export function computePayslip(input: EngineInput): Payslip {
  const { settings: s, structure, components, employment, days, adjustments } = input;
  const warnings: string[] = [];

  const inEmployment = (d: string) => d >= employment.joinedOn && (employment.leftOn === null || d <= employment.leftOn);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let periodDays = 0;
  let workingDaysInPeriod = 0;
  let employedDays = 0;
  let employedWorkingDays = 0;
  let paidLeaveDays = 0;
  let lopLeaveDays = 0;
  let compOffLeaveDays = 0;
  let absentDays = 0;
  let presentDays = 0;
  let wfhDays = 0;
  let holidayWorkedDays = 0;
  let compOffEarnedDays = 0;
  let leaveSeen = 0;
  let overtimeHundredths = 0;
  let holidayWorkHundredths = 0;
  let holidayWorkPaidHundredths = 0;
  let pendingCompOffOnPaidDay = false;

  for (const d of sorted) {
    periodDays += 1;
    const working = !d.weekOff && !d.holiday;
    if (working) workingDaysInPeriod += 1;
    if (!inEmployment(d.date)) continue;

    employedDays += 1;
    if (working) {
      employedWorkingDays += 1;
      if (d.compOffLeave) {
        compOffLeaveDays += 1; // paid
      } else if (d.leave) {
        leaveSeen += 1;
        if (leaveSeen <= s.paidLeavePerMonth) paidLeaveDays += 1;
        else lopLeaveDays += 1;
      } else if (d.hoursHundredths <= 0 && !d.wfh) {
        absentDays += 1;
      } else {
        presentDays += 1;
      }
      if (d.wfh && !d.leave && !d.compOffLeave) wfhDays += 1;
      if (s.overtimeEnabled && d.hoursHundredths > s.standardHundredths) {
        overtimeHundredths += d.hoursHundredths - s.standardHundredths;
      }
    } else if (d.hoursHundredths > 0) {
      holidayWorkedDays += 1;
      if (d.compOffEarned) compOffEarnedDays += 1;
      holidayWorkHundredths += d.hoursHundredths;
      if (s.holidayWorkMode === "pay") {
        // Never pay a day that already earned comp-off.
        if (d.compOffEarned) {
          warnings.push(`${d.date}: worked on a day off and already has approved comp-off, so it is not paid again.`);
        } else {
          holidayWorkPaidHundredths += d.hoursHundredths;
          if (d.compOffPending) pendingCompOffOnPaidDay = true;
        }
      }
    }
  }

  const manualLop = Math.max(0, Math.trunc(input.manualLopDays ?? 0));
  const lopDays = lopLeaveDays + manualLop;
  const baseDays = s.payBasis === "calendar_days" ? periodDays : workingDaysInPeriod;
  const inScope = s.payBasis === "calendar_days" ? employedDays : employedWorkingDays;
  const payableDays = Math.max(0, inScope - lopDays - absentDays);

  if (employedDays === 0) warnings.push("The person was not employed on any day of this month, so nothing is payable.");
  if (!structure) warnings.push("There is no salary structure in force for this month. Salary lines are zero.");
  if (baseDays === 0) warnings.push("This month has no working days under the current settings.");
  if (pendingCompOffOnPaidDay) warnings.push("A comp-off request is still pending for a day paid as holiday work. Decide it first so the day is not paid twice.");

  const earnings: Line[] = [];
  const deductions: Line[] = [];
  const pro = (amount: Paise): Paise => (baseDays > 0 ? proRate(amount, payableDays, baseDays) : 0);

  // Salary, pro-rated by payable days.
  const basic = structure ? pro(structure.basic) : 0;
  const hra = structure ? pro(structure.hra) : 0;
  const allowances = structure ? pro(structure.allowances) : 0;
  if (structure) {
    earnings.push({ code: "basic", label: "Basic", amount: basic });
    if (structure.hra > 0) earnings.push({ code: "hra", label: "HRA", amount: hra });
    if (structure.allowances > 0) earnings.push({ code: "allowances", label: "Other allowances", amount: allowances });
  }

  // Overtime and holiday work: paid from the full monthly rate, by the hour.
  const monthlyBase = structure ? (s.overtimeBase === "gross" ? structure.basic + structure.hra + structure.allowances : structure.basic) : 0;
  const hourly = (hundredthsWorked: number, rateBp: number): Paise =>
    workingDaysInPeriod > 0 && s.standardHundredths > 0
      ? mulDivRound(monthlyBase, hundredthsWorked * rateBp, workingDaysInPeriod * s.standardHundredths * 10_000)
      : 0;
  if (structure && overtimeHundredths > 0) {
    earnings.push({ code: "overtime", label: `Overtime (${hours(overtimeHundredths)} h)`, amount: hourly(overtimeHundredths, s.overtimeRateBp) });
  }
  if (structure && holidayWorkPaidHundredths > 0) {
    earnings.push({ code: "holiday_work", label: `Work on holiday / week off (${hours(holidayWorkPaidHundredths)} h)`, amount: hourly(holidayWorkPaidHundredths, s.holidayWorkRateBp) });
  }

  // Custom earnings (fixed amounts are pro-rated like salary; percentages are of the basic earned).
  for (const c of components.filter((x) => x.enabled && x.kind === "earning")) {
    const amount = c.calc === "fixed" ? pro(c.amount) : percentOf(basic, c.percentBp);
    earnings.push({ code: c.code, label: c.name, amount });
  }

  const earnedGross = earnings.reduce((n, l) => n + l.amount, 0);

  // One-off additions.
  for (const a of adjustments.filter((x) => x.kind !== "deduction")) {
    earnings.push({ code: a.kind, label: a.label, amount: a.amount });
  }
  const gross = earnings.reduce((n, l) => n + l.amount, 0);

  // Deductions. Fixed structure deductions and fixed components are monthly amounts, not pro-rated.
  if (structure && structure.deductions > 0) deductions.push({ code: "fixed_deductions", label: "Fixed deductions", amount: structure.deductions });
  for (const c of components.filter((x) => x.enabled && x.kind === "deduction")) {
    const base = c.percentOf === "gross" ? earnedGross : basic;
    deductions.push({ code: c.code, label: c.name, amount: c.calc === "fixed" ? c.amount : percentOf(base, c.percentBp) });
  }
  for (const a of adjustments.filter((x) => x.kind === "deduction")) {
    deductions.push({ code: "deduction", label: a.label, amount: a.amount });
  }

  const totalDeductions = deductions.reduce((n, l) => n + l.amount, 0);
  let net = gross - totalDeductions;
  let roundingAdjustment = 0;
  if (s.roundNetToRupee) {
    const rounded = mulDivRound(net, 1, 100) * 100;
    roundingAdjustment = rounded - net;
    net = rounded;
  }
  if (net < 0) warnings.push("Deductions are larger than earnings, so the net pay is negative. Review the deductions before finalising.");

  return {
    periodDays,
    workingDaysInPeriod,
    employedDays,
    payableDays,
    baseDays,
    lopDays,
    absentDays,
    paidLeaveDays,
    compOffLeaveDays,
    employedWorkingDays,
    presentDays,
    wfhDays,
    holidayWorkedDays,
    compOffEarnedDays,
    overtimeHours: hours(overtimeHundredths),
    holidayWorkHours: hours(holidayWorkHundredths),
    earnings,
    deductions,
    gross,
    totalDeductions,
    roundingAdjustment,
    net,
    warnings,
  };
}
