// Plain data shapes for the payroll pages. Amounts are whole paise, percentages whole basis points (see money.ts).
// Shared by the server and the browser (no server-only code).

export type StructureRow = {
  id: string;
  effectiveFrom: string;
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  note: string;
  createdAt: string;
};

export type StructureInput = {
  effectiveFrom: string;
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  note: string;
};

export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  joinedOn: string;
  leftOn: string | null;
  /** The structure in force today (null if none yet). */
  current: StructureRow | null;
  /** The next structure, if one is already scheduled to start later. */
  upcoming: StructureRow | null;
};

export type EmployeeDetailsInput = { joinedOn: string; leftOn: string | null; department: string };

export type PayrollSettingsData = {
  currency: string;
  cycleStartDay: number;
  payBasis: "calendar_days" | "working_days";
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  weeklyOffDays: number[];
  holidayWorkMode: "comp_off" | "pay";
  overtimeEnabled: boolean;
  overtimeRateBp: number;
  holidayWorkRateBp: number;
  /** Hours in a standard working day, e.g. 8. */
  standardHours: number;
  overtimeBase: "basic" | "gross";
  paidLeavePerMonth: number;
  roundNetToRupee: boolean;
  /** Employees can see their own salary structure (CTC breakdown) on My Salary. Off by default. */
  showStructureToEmployees: boolean;
};

export type ComponentRow = {
  id: string;
  code: string;
  name: string;
  kind: "earning" | "deduction";
  calc: "fixed" | "percent";
  amount: number;
  percentBp: number;
  percentOf: "basic" | "gross";
  enabled: boolean;
  statutory: boolean;
  sortOrder: number;
};

export type ComponentInput = {
  id?: string;
  code: string;
  name: string;
  kind: "earning" | "deduction";
  calc: "fixed" | "percent";
  amount: number;
  percentBp: number;
  percentOf: "basic" | "gross";
  enabled: boolean;
};

export type AuditRow = { id: number; actor: string; action: string; entity: string; detail: string; at: string };

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
