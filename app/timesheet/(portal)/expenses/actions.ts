"use server";

import { revalidatePath } from "next/cache";
import { deleteMyClaim, getClaimEvents, saveMyClaim, submitMyClaim, type ClaimInput } from "@/lib/expenses/server";
import type { ClaimEvent } from "@/lib/expenses/types";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// An employee's own expense claims. The person is taken from the session inside lib/expenses/server.ts, never from here.
export type ExpenseResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(e: unknown): ExpenseResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("expenses", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => {
  revalidatePath("/timesheet/expenses");
  revalidatePath("/timesheet/payroll/expenses");
};

export async function saveClaimAction(input: ClaimInput): Promise<ExpenseResult> {
  try {
    const id = await saveMyClaim(input);
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function submitClaimAction(id: string): Promise<ExpenseResult> {
  try {
    await submitMyClaim(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClaimAction(id: string): Promise<ExpenseResult> {
  try {
    await deleteMyClaim(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function claimHistoryAction(id: string): Promise<{ ok: true; events: ClaimEvent[] } | { ok: false; error: string }> {
  try {
    return { ok: true, events: await getClaimEvents(id) };
  } catch (e) {
    const r = fail(e);
    return r.ok ? { ok: false, error: "Something went wrong." } : r;
  }
}
