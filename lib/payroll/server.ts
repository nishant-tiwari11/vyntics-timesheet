import "server-only";
import { db, requireAdmin } from "@/lib/timesheet/auth";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, assertDate, assertId, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { MAX_PAISE } from "./money";
import type {
  AuditRow,
  ComponentInput,
  ComponentRow,
  EmployeeDetailsInput,
  EmployeeRow,
  PayrollSettingsData,
  StructureInput,
  StructureRow,
} from "./types";

// Every function here starts with requireAdmin(): payroll is for admins only, checked on the server every time, and the
// database refuses everyone else too (row level security). Salary figures are never logged, never put in an address and
// never sent anywhere except to the signed-in admin's own page. Errors are logged by name and code only.

// ---------------------------- Audit log ----------------------------

/** Record who did what, and when. `detail` must never contain a salary figure. Failing to log never blocks the page. */
export async function audit(action: string, entity: string, entityId?: string, detail?: string): Promise<void> {
  try {
    const admin = await requireAdmin();
    const supabase = await db();
    const { error } = await supabase
      .from("payroll_audit")
      .insert({ actor_id: admin.id, action, entity, entity_id: entityId ?? null, detail: detail ? detail.slice(0, 300) : null });
    if (error) logError("payroll-audit", error);
  } catch (e) {
    logError("payroll-audit", e);
  }
}

export async function listAudit(limit = 25): Promise<AuditRow[]> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("payroll_audit")
    .select("id, action, entity, detail, created_at, actor:profiles!payroll_audit_actor_id_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw toError(error, "Couldn't load the activity log. Please try again.");
  return data.map((r) => ({
    id: r.id,
    actor: displayName(r.actor as { full_name: string | null; email: string } | null),
    action: r.action,
    entity: r.entity,
    detail: r.detail ?? "",
    at: r.created_at,
  }));
}

// ---------------------------- Money checks ----------------------------

function assertPaise(value: unknown, label: string, min = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value >= MAX_PAISE) {
    throw new TimesheetError(`Enter a valid amount for ${label}.`);
  }
  return value;
}

// ---------------------------- Employees and salary structures ----------------------------

type StructureDb = {
  id: string;
  user_id: string;
  effective_from: string;
  basic_paise: number;
  hra_paise: number;
  allowances_paise: number;
  deductions_paise: number;
  note: string | null;
  created_at: string;
};

const toStructure = (r: StructureDb): StructureRow => ({
  id: r.id,
  effectiveFrom: r.effective_from,
  basic: r.basic_paise,
  hra: r.hra_paise,
  allowances: r.allowances_paise,
  deductions: r.deductions_paise,
  note: r.note ?? "",
  createdAt: r.created_at,
});

/** Every employee with their department, dates and the salary structure in force today. */
export async function listEmployeeStructures(): Promise<EmployeeRow[]> {
  await requireAdmin();
  const supabase = await db();
  const [people, details, structures] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").order("full_name", { ascending: true }),
    supabase.from("employee_details").select("user_id, joined_on, left_on, department"),
    supabase.from("salary_structures").select("*").order("effective_from", { ascending: false }).limit(5000),
  ]);
  if (people.error) throw toError(people.error, "Couldn't load employees. Please try again.");
  if (details.error) throw toError(details.error, "Couldn't load employees. Please try again.");
  if (structures.error) throw toError(structures.error, "Couldn't load salary structures. Please try again.");

  const today = todayInOffice();
  const detailBy = new Map(details.data.map((d) => [d.user_id, d]));
  const structuresBy = new Map<string, StructureDb[]>();
  for (const s of structures.data as StructureDb[]) {
    const list = structuresBy.get(s.user_id) ?? [];
    list.push(s);
    structuresBy.set(s.user_id, list);
  }

  return people.data
    .map((p) => {
      const d = detailBy.get(p.id);
      const list = structuresBy.get(p.id) ?? []; // newest first
      const current = list.find((s) => s.effective_from <= today);
      const upcoming = [...list].reverse().find((s) => s.effective_from > today);
      return {
        id: p.id,
        name: displayName(p),
        email: p.email,
        department: d?.department ?? "",
        joinedOn: d?.joined_on ?? p.created_at.slice(0, 10),
        leftOn: d?.left_on ?? null,
        current: current ? toStructure(current) : null,
        upcoming: upcoming ? toStructure(upcoming) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listStructureHistory(userId: string): Promise<StructureRow[]> {
  assertId(userId, "employee");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("salary_structures").select("*").eq("user_id", userId).order("effective_from", { ascending: false }).limit(200);
  if (error) throw toError(error, "Couldn't load the salary history. Please try again.");
  return (data as StructureDb[]).map(toStructure);
}

/** A change of salary is a NEW row with its own effective date. Old rows are never edited or deleted. */
export async function addStructure(userId: string, input: StructureInput): Promise<void> {
  assertId(userId, "employee");
  const effectiveFrom = assertDate(input.effectiveFrom, "effective date");
  const basic = assertPaise(input.basic, "basic pay", 1);
  const hra = assertPaise(input.hra, "HRA");
  const allowances = assertPaise(input.allowances, "other allowances");
  const deductions = assertPaise(input.deductions, "deductions");
  const note = String(input.note ?? "").trim();
  if (note.length > 300) throw new TimesheetError("Keep the note to 300 characters or fewer.");

  const admin = await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.from("salary_structures").insert({
    user_id: userId,
    effective_from: effectiveFrom,
    basic_paise: basic,
    hra_paise: hra,
    allowances_paise: allowances,
    deductions_paise: deductions,
    note: note || null,
    created_by: admin.id,
  });
  if (error) {
    if (error.code === "23505") throw new TimesheetError("This employee already has a salary structure starting on that date. Choose a different date.");
    throw toError(error, "Couldn't save the salary structure. Please try again.");
  }
  await audit("structure_added", "salary_structure", userId, `New salary structure effective from ${effectiveFrom}`);
}

export async function saveEmployeeDetails(userId: string, input: EmployeeDetailsInput): Promise<void> {
  assertId(userId, "employee");
  const joinedOn = assertDate(input.joinedOn, "joining date");
  const leftOn = input.leftOn ? assertDate(input.leftOn, "leaving date") : null;
  if (leftOn && leftOn < joinedOn) throw new TimesheetError("The leaving date can't be before the joining date.");
  const department = String(input.department ?? "").trim();
  if (department.length > 80) throw new TimesheetError("Keep the department name to 80 characters or fewer.");

  const admin = await requireAdmin();
  const supabase = await db();
  const { error } = await supabase
    .from("employee_details")
    .upsert({ user_id: userId, joined_on: joinedOn, left_on: leftOn, department: department || null, updated_by: admin.id }, { onConflict: "user_id" });
  if (error) throw toError(error, "Couldn't save the employee details. Please try again.");
  await audit("details_saved", "employee", userId, "Joining date, leaving date or department changed");
}

// ---------------------------- Settings ----------------------------

export async function getPayrollSettings(): Promise<PayrollSettingsData> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_settings").select("*").maybeSingle();
  if (error) throw toError(error, "Couldn't load the payroll settings. Please try again.");
  if (!data) throw new TimesheetError("Payroll isn't set up yet. Run the payroll SQL step in Supabase first.");
  return {
    currency: data.currency,
    cycleStartDay: data.cycle_start_day,
    payBasis: data.pay_basis as PayrollSettingsData["payBasis"],
    weeklyOffDays: data.weekly_off_days,
    holidayWorkMode: data.holiday_work_mode as PayrollSettingsData["holidayWorkMode"],
    overtimeEnabled: data.overtime_enabled,
    overtimeRateBp: data.overtime_rate_bp,
    holidayWorkRateBp: data.holiday_work_rate_bp,
    standardHours: data.standard_hours_per_day,
    overtimeBase: data.overtime_base as PayrollSettingsData["overtimeBase"],
    paidLeavePerMonth: data.paid_leave_per_month,
    roundNetToRupee: data.round_net_to_rupee,
    showStructureToEmployees: data.show_structure_to_employees,
  };
}

export async function savePayrollSettings(input: PayrollSettingsData): Promise<void> {
  if (!/^[A-Z]{3}$/.test(input.currency ?? "")) throw new TimesheetError("Use a three-letter currency code such as INR.");
  if (!Number.isInteger(input.cycleStartDay) || input.cycleStartDay < 1 || input.cycleStartDay > 28) throw new TimesheetError("The month starts on a day from 1 to 28.");
  if (!["calendar_days", "working_days"].includes(input.payBasis)) throw new TimesheetError("Choose how a day's pay is worked out.");
  const offs = [...new Set(input.weeklyOffDays ?? [])];
  if (offs.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || offs.length > 6) throw new TimesheetError("Choose between 0 and 6 weekly off days.");
  if (!["comp_off", "pay"].includes(input.holidayWorkMode)) throw new TimesheetError("Choose Comp-off or Pay for work on a day off.");
  for (const [bp, label] of [[input.overtimeRateBp, "overtime"], [input.holidayWorkRateBp, "holiday work"]] as const) {
    if (!Number.isInteger(bp) || bp < 10000 || bp > 50000) throw new TimesheetError(`The ${label} rate must be between 1.0 and 5.0 times the normal rate.`);
  }
  if (!(input.standardHours > 0 && input.standardHours <= 24)) throw new TimesheetError("Standard hours per day must be between 0 and 24.");
  if (!["basic", "gross"].includes(input.overtimeBase)) throw new TimesheetError("Choose basic or gross as the overtime base.");
  if (!Number.isInteger(input.paidLeavePerMonth) || input.paidLeavePerMonth < 0 || input.paidLeavePerMonth > 31) throw new TimesheetError("Paid leave per month must be a whole number from 0 to 31.");

  const admin = await requireAdmin();
  const supabase = await db();
  const { error } = await supabase
    .from("payroll_settings")
    .update({
      currency: input.currency,
      cycle_start_day: input.cycleStartDay,
      pay_basis: input.payBasis,
      weekly_off_days: offs.sort(),
      holiday_work_mode: input.holidayWorkMode,
      overtime_enabled: !!input.overtimeEnabled,
      overtime_rate_bp: input.overtimeRateBp,
      holiday_work_rate_bp: input.holidayWorkRateBp,
      standard_hours_per_day: input.standardHours,
      overtime_base: input.overtimeBase,
      paid_leave_per_month: input.paidLeavePerMonth,
      round_net_to_rupee: !!input.roundNetToRupee,
      show_structure_to_employees: !!input.showStructureToEmployees,
      updated_by: admin.id,
    })
    .eq("id", true);
  if (error) throw toError(error, "Couldn't save the payroll settings. Please try again.");
  await audit("settings_saved", "payroll_settings", undefined, "Payroll settings changed");
}

// ---------------------------- Components ----------------------------

export async function listComponents(): Promise<ComponentRow[]> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_components").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) throw toError(error, "Couldn't load the pay components. Please try again.");
  return data.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    kind: c.kind as ComponentRow["kind"],
    calc: c.calc as ComponentRow["calc"],
    amount: c.amount_paise,
    percentBp: c.percent_bp,
    percentOf: c.percent_of as ComponentRow["percentOf"],
    enabled: c.enabled,
    statutory: c.statutory,
    sortOrder: c.sort_order,
  }));
}

export async function saveComponent(input: ComponentInput): Promise<void> {
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 60) throw new TimesheetError("Enter a name of up to 60 characters.");
  if (!["earning", "deduction"].includes(input.kind)) throw new TimesheetError("Choose earning or deduction.");
  if (!["fixed", "percent"].includes(input.calc)) throw new TimesheetError("Choose a fixed amount or a percentage.");
  const amount = assertPaise(input.amount, "the amount");
  if (!Number.isInteger(input.percentBp) || input.percentBp < 0 || input.percentBp > 10000) throw new TimesheetError("A percentage must be between 0 and 100.");
  const percentOf = input.percentOf === "gross" ? "gross" : "basic";
  if (input.kind === "earning" && input.calc === "percent" && percentOf !== "basic") throw new TimesheetError("An earning can only be a percentage of basic pay.");

  const admin = await requireAdmin();
  const supabase = await db();
  const fields = { name, kind: input.kind, calc: input.calc, amount_paise: amount, percent_bp: input.percentBp, percent_of: percentOf, enabled: !!input.enabled, updated_by: admin.id };

  if (input.id) {
    assertId(input.id, "component");
    // A built-in statutory component keeps its code, name and kind; its rates are edited, never hard-coded.
    const { data: current } = await supabase.from("payroll_components").select("statutory").eq("id", input.id).maybeSingle();
    if (!current) throw new TimesheetError("That component no longer exists. Please refresh.");
    const update = current.statutory ? { calc: fields.calc, amount_paise: fields.amount_paise, percent_bp: fields.percent_bp, percent_of: fields.percent_of, enabled: fields.enabled, updated_by: admin.id } : fields;
    const { error } = await supabase.from("payroll_components").update(update).eq("id", input.id);
    if (error) throw toError(error, "Couldn't save the component. Please try again.");
    await audit("component_saved", "payroll_component", input.id, `${name} changed`);
  } else {
    if (!/^[a-z0-9_]{2,30}$/.test(input.code ?? "")) throw new TimesheetError("The code uses 2 to 30 lowercase letters, numbers or underscores.");
    const { error } = await supabase.from("payroll_components").insert({ code: input.code, ...fields });
    if (error) {
      if (error.code === "23505") throw new TimesheetError("A component with that code already exists.");
      throw toError(error, "Couldn't save the component. Please try again.");
    }
    await audit("component_added", "payroll_component", input.code, `${name} added`);
  }
}

export async function deleteComponent(id: string): Promise<void> {
  assertId(id, "component");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_components").delete().eq("id", id).eq("statutory", false).select("id, name");
  if (error) throw toError(error, "Couldn't delete the component. Please try again.");
  if (!data?.length) throw new TimesheetError("Only custom components can be deleted. Switch a built-in one off instead.");
  await audit("component_deleted", "payroll_component", id, `${data[0].name} deleted`);
}
