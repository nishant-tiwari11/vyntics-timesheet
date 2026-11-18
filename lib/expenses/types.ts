// Plain data shapes and wording for expense claims. Shared by the server and the browser (no server-only code).
// Amounts are whole paise, like everywhere in payroll (see lib/payroll/money.ts).

export type ExpenseStatus = "draft" | "pending" | "approved" | "added_to_payroll" | "reimbursed" | "rejected";

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: "Draft",
  pending: "Pending approval",
  approved: "Approved: pending payroll",
  added_to_payroll: "Added to payroll",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
};

// Symbols as well as words, so a status never depends on colour alone (same idea as the payroll run badge).
export const STATUS_SYMBOL: Record<ExpenseStatus, string> = {
  draft: "○",
  pending: "◐",
  approved: "✓",
  added_to_payroll: "✓",
  reimbursed: "✓✓",
  rejected: "✕",
};

export type CategoryRow = { id: string; name: string; limit: number | null; taxable: boolean; enabled: boolean };

export type ClaimRow = {
  id: string;
  /** "EXP-00012" */
  code: string;
  userId: string;
  employee: string;
  employeeEmail: string;
  date: string;
  categoryId: string;
  category: string;
  description: string;
  claimed: number;
  /** What will be (or was) paid. Null until an admin approves. */
  approved: number | null;
  status: ExpenseStatus;
  /** "2026-11": the pay month it goes in (or went in). */
  payrollMonth: string | null;
  payrollRunId: string | null;
  taxable: boolean;
  decidedBy: string;
  decidedAt: string | null;
  decisionNote: string;
  reimbursedOn: string | null;
};

export type ClaimEvent = { id: number; actor: string; action: string; detail: string; at: string };

/** "EXP-00012" for claim number 12. */
export const claimCode = (no: number) => `EXP-${String(no).padStart(5, "0")}`;

/** "Nov 2026" for "2026-11". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The sentence an employee sees next to the status, e.g. "Will be paid with Nov 2026 salary". */
export function payrollNote(c: Pick<ClaimRow, "status" | "payrollMonth" | "reimbursedOn" | "decisionNote">): string {
  const month = c.payrollMonth ? monthLabel(c.payrollMonth) : "";
  switch (c.status) {
    case "draft":
      return "Not submitted yet";
    case "pending":
      return "Waiting for an admin to approve it";
    case "approved":
      return month ? `Will be paid with ${month} salary` : "Approved";
    case "added_to_payroll":
      return month ? `In the ${month} payroll, not paid yet` : "In a payroll run";
    case "reimbursed":
      return month ? `Paid with ${month} salary${c.reimbursedOn ? `, ${c.reimbursedOn}` : ""}` : "Paid";
    case "rejected":
      return c.decisionNote || "Not approved";
  }
}

/** Filters on the admin list. "pending_payroll" is approved plus added-to-payroll (approved, not yet paid). */
export const ADMIN_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending approval" },
  { id: "pending_payroll", label: "Pending payroll" },
  { id: "reimbursed", label: "Reimbursed" },
  { id: "rejected", label: "Rejected" },
] as const;
export type AdminFilter = (typeof ADMIN_FILTERS)[number]["id"];

export const isAdminFilter = (v: unknown): v is AdminFilter => ADMIN_FILTERS.some((f) => f.id === v);

/** The statuses each filter shows. */
export const FILTER_STATUSES: Record<AdminFilter, ExpenseStatus[] | null> = {
  all: null,
  pending: ["pending"],
  pending_payroll: ["approved", "added_to_payroll"],
  reimbursed: ["reimbursed"],
  rejected: ["rejected"],
};

/** One CSV cell. One that starts with = + - or @ would be run as a formula by a spreadsheet, so it gets a leading apostrophe. */
export function csvCell(v: string | number | null): string {
  let t = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
