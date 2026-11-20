// A payslip split the way an owner reads it: base salary, bonus, other earnings, expenses reimbursed, deductions, final total.
// Pure (no database), so the run page, the history page and the tests all use the same sums.

import type { Payslip } from "./engine";

/** The earning lines the engine itself adds for the salary structure. Everything else in earnings is "other". */
const BASE_CODES = new Set(["basic", "hra", "allowances"]);

export type PayBreakdown = {
  /** Basic + HRA + allowances, as earned for the payable days. */
  base: number;
  /** One-off bonuses added by an admin. */
  bonus: number;
  /** Overtime, holiday work, arrears, custom earnings, one-off reimbursements and taxable expenses. */
  otherEarnings: number;
  /** Approved expense claims paid back on top of salary (taxable ones sit in otherEarnings, not here). */
  expenses: number;
  /** Everything that is paid: base + bonus + other earnings (this is the payslip's gross). */
  gross: number;
  deductions: number;
  rounding: number;
  /** The final amount paid: gross - deductions + expenses (+ rounding). */
  total: number;
};

export function payBreakdown(p: Pick<Payslip, "earnings" | "gross" | "totalDeductions" | "reimbursement" | "roundingAdjustment" | "net">): PayBreakdown {
  let base = 0;
  let bonus = 0;
  for (const line of p.earnings) {
    if (BASE_CODES.has(line.code)) base += line.amount;
    else if (line.code === "bonus") bonus += line.amount;
  }
  return {
    base,
    bonus,
    otherEarnings: p.gross - base - bonus,
    expenses: p.reimbursement ?? 0,
    gross: p.gross,
    deductions: p.totalDeductions,
    rounding: p.roundingAdjustment ?? 0,
    total: p.net,
  };
}
