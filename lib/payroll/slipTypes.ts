// What an employee sees of a payslip. Plain data, shared by the server and the browser (no server-only code).

import type { ExpenseItem } from "./engine";

export type SlipLine = { code: string; label: string; amount: number };

export type PayslipListItem = {
  id: string;
  /** "2026-11": the pay month, named after the month it ends in. */
  month: string;
  periodStart: string;
  periodEnd: string;
  status: "finalized" | "paid";
  paidOn: string | null;
  gross: number;
  deductions: number;
  net: number;
  payableDays: number;
  lopDays: number;
  currency: string;
};

export type PayslipDetail = PayslipListItem & {
  employee: { name: string; email: string; department: string };
  earnings: SlipLine[];
  /** Expense claims paid back with this salary (all of them, taxable or not), for the payslip breakdown. */
  expenses: ExpenseItem[];
  /** The part of those that is paid on top of gross (the non-taxable claims). Net = gross - deductions + this. */
  reimbursement: number;
  deductionLines: SlipLine[];
  roundingAdjustment: number;
  attendance: {
    /** Days the month is divided across (all days, or working days). */
    baseDays: number;
    workingDays: number;
    presentDays: number;
    wfhDays: number;
    paidLeaveDays: number;
    compOffLeaveDays: number;
    lopDays: number;
    absentDays: number;
    holidayWorkedDays: number;
    compOffEarnedDays: number;
    overtimeHours: number;
  };
};

export type StructureView = {
  effectiveFrom: string;
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  monthlyGross: number;
  annualGross: number;
  currency: string;
};
