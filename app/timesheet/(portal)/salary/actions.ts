"use server";

import { revalidatePath } from "next/cache";
import { raiseQuery } from "@/lib/payroll/queries";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type SalaryResult = { ok: true } | { ok: false; error: string };

// An employee raising a question about THEIR OWN payslip. The person is taken from the session in lib/payroll/queries.ts,
// and the database refuses a payslip that isn't theirs.
export async function raiseQueryAction(payslipId: string, topic: string, message: string): Promise<SalaryResult> {
  try {
    await raiseQuery(payslipId, topic, message);
    revalidatePath("/timesheet/salary");
    revalidatePath("/timesheet/payroll/queries");
    return { ok: true };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("salary", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// ---- the salary PIN behind "Show amounts" ----
export type PinActionResult = { ok: true } | { ok: false; error: string };

const MESSAGE = {
  wrong: "That isn't right. Five wrong tries lock it for 15 minutes.",
  locked: "Too many wrong tries. Try again in 15 minutes.",
  invalid: "The PIN must be 4 to 6 digits.",
  none: "You haven't set a salary PIN yet.",
} as const;

async function pinAction(run: () => Promise<import("@/lib/payroll/pin").PinResult>): Promise<PinActionResult> {
  try {
    const r = await run();
    if (r !== "ok") return { ok: false, error: MESSAGE[r] };
    revalidatePath("/timesheet/salary");
    return { ok: true };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("salary-pin", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function createSalaryPinAction(pin: string): Promise<PinActionResult> {
  const { setSalaryPin } = await import("@/lib/payroll/pin");
  return pinAction(() => setSalaryPin(String(pin)));
}
export async function unlockSalaryAction(pin: string): Promise<PinActionResult> {
  const { checkSalaryPin } = await import("@/lib/payroll/pin");
  return pinAction(() => checkSalaryPin(String(pin)));
}
export async function resetSalaryPinAction(password: string, pin: string): Promise<PinActionResult> {
  const { resetSalaryPin } = await import("@/lib/payroll/pin");
  return pinAction(() => resetSalaryPin(String(password), String(pin)));
}
export async function lockSalaryAction(): Promise<PinActionResult> {
  try {
    const { lockSalary } = await import("@/lib/payroll/pin");
    await lockSalary();
    revalidatePath("/timesheet/salary");
    return { ok: true };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("salary-pin", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
