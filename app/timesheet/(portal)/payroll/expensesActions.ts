"use server";

import { revalidatePath } from "next/cache";
import { approveClaim, rejectClaim, removeClaimFromRun, saveCategory } from "@/lib/expenses/server";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Admins only: each function ends up in lib/expenses/server.ts, which checks for an admin on the server, and the
// database function checks again.
export type ExpenseAdminResult = { ok: true; status?: "approved" | "added_to_payroll" } | { ok: false; error: string };

function fail(e: unknown): ExpenseAdminResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("payroll-expenses", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// A claim's status also shows on the employee's page, and a payroll run's totals change when claims move in or out.
const refresh = () => {
  revalidatePath("/timesheet/payroll/expenses");
  revalidatePath("/timesheet/payroll/runs", "layout");
  revalidatePath("/timesheet/expenses");
  revalidatePath("/timesheet/salary");
};

export async function approveClaimAction(id: string, amount: number, month: string, note: string): Promise<ExpenseAdminResult> {
  try {
    const status = await approveClaim(id, amount, month, note);
    refresh();
    return { ok: true, status };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectClaimAction(id: string, note: string): Promise<ExpenseAdminResult> {
  try {
    await rejectClaim(id, note);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeFromRunAction(id: string): Promise<ExpenseAdminResult> {
  try {
    await removeClaimFromRun(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCategoryAction(input: { id?: string; name: string; limit: number | null; taxable: boolean; enabled: boolean }): Promise<ExpenseAdminResult> {
  try {
    await saveCategory(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
