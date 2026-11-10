"use server";

import { revalidatePath } from "next/cache";
import {
  addStructure,
  audit,
  deleteComponent,
  listStructureHistory,
  saveComponent,
  saveEmployeeDetails,
  savePayrollSettings,
} from "@/lib/payroll/server";
import type { ComponentInput, EmployeeDetailsInput, PayrollSettingsData, StructureInput, StructureRow } from "@/lib/payroll/types";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Payroll is for admins only. Each function below ends up in lib/payroll/server.ts, which checks for an admin on the
// server (and the database checks again). Nothing here logs a salary figure.

export type PayrollResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): PayrollResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("payroll", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => {
  revalidatePath("/timesheet/payroll/structures");
  revalidatePath("/timesheet/payroll/settings");
};

export async function addStructureAction(userId: string, input: StructureInput): Promise<PayrollResult> {
  try {
    await addStructure(userId, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveEmployeeDetailsAction(userId: string, input: EmployeeDetailsInput): Promise<PayrollResult> {
  try {
    await saveEmployeeDetails(userId, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The full salary history of one employee, for the History pop-up. Opening it is recorded in the activity log. */
export async function structureHistoryAction(userId: string): Promise<{ ok: true; rows: StructureRow[] } | { ok: false; error: string }> {
  try {
    const rows = await listStructureHistory(userId);
    await audit("viewed_history", "salary_structure", userId, "Opened an employee's salary history");
    return { ok: true, rows };
  } catch (e) {
    const r = fail(e);
    return r.ok ? { ok: false, error: "Something went wrong. Please try again." } : r;
  }
}

export async function saveSettingsAction(input: PayrollSettingsData): Promise<PayrollResult> {
  try {
    await savePayrollSettings(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveComponentAction(input: ComponentInput): Promise<PayrollResult> {
  try {
    await saveComponent(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteComponentAction(id: string): Promise<PayrollResult> {
  try {
    await deleteComponent(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
