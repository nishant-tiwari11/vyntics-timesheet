"use server";

import { revalidatePath } from "next/cache";
import { addAdjustment, createRun, deleteAdjustment, deleteDraftRun, finalizeRun, markPaid, reopenRun, setManualLop, setReviewed } from "@/lib/payroll/runs";
import { answerQuery } from "@/lib/payroll/queries";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Admins only: each function ends up in lib/payroll/runs.ts or queries.ts, which check for an admin on the server and
// the database checks again. Nothing here logs a salary figure.

export type RunResult = { ok: true; id?: string; count?: number } | { ok: false; error: string };

function fail(e: unknown): RunResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("payroll-runs", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = (runId?: string) => {
  revalidatePath("/timesheet/payroll/runs");
  if (runId) revalidatePath(`/timesheet/payroll/runs/${runId}`);
  revalidatePath("/timesheet/payroll/queries");
  revalidatePath("/timesheet/salary"); // employees' payslips change when a run is finalized, paid or reopened
};

export async function createRunAction(month: string): Promise<RunResult> {
  try {
    const id = await createRun(month);
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function addAdjustmentAction(runId: string, userId: string, input: { kind: "bonus" | "arrears" | "reimbursement" | "deduction"; label: string; amount: number }): Promise<RunResult> {
  try {
    await addAdjustment(runId, userId, input);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAdjustmentAction(runId: string, adjustmentId: string): Promise<RunResult> {
  try {
    await deleteAdjustment(runId, adjustmentId);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setManualLopAction(runId: string, userId: string, days: number): Promise<RunResult> {
  try {
    await setManualLop(runId, userId, days);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setReviewedAction(runId: string, reviewed: boolean): Promise<RunResult> {
  try {
    await setReviewed(runId, reviewed);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function finalizeRunAction(runId: string): Promise<RunResult> {
  try {
    const count = await finalizeRun(runId);
    refresh(runId);
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}

export async function markPaidAction(runId: string, paidOn: string): Promise<RunResult> {
  try {
    await markPaid(runId, paidOn);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenRunAction(runId: string, reason: string): Promise<RunResult> {
  try {
    await reopenRun(runId, reason);
    refresh(runId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRunAction(runId: string): Promise<RunResult> {
  try {
    await deleteDraftRun(runId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function answerQueryAction(id: string, status: "open" | "resolved", reply: string): Promise<RunResult> {
  try {
    await answerQuery(id, status, reply);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
