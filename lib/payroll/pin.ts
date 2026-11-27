import "server-only";
import { db, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError } from "@/lib/timesheet/errors";

// The salary PIN (see supabase/step43_salary_pin.sql). The person is always the signed-in one; the database does the checking,
// the counting of wrong tries and the timing.

export type PinState = "none" | "locked" | "open";
export type PinResult = "ok" | "wrong" | "locked" | "invalid" | "none";

const FAILED = "Couldn't check the PIN. Please try again.";

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.rpc(fn as never, (args ?? {}) as never);
  if (error) {
    // The functions are missing until step 43 has been run.
    throw new TimesheetError(/function|does not exist|schema cache/i.test(error.message) ? "The salary PIN isn't set up yet. Ask an admin to run step 43." : FAILED);
  }
  return data as T;
}

/** 'none' = no PIN yet, 'locked' = amounts hidden, 'open' = unlocked for a few minutes. */
export async function salaryPinState(): Promise<PinState> {
  const s = await call<string>("salary_pin_state");
  return s === "open" || s === "locked" ? s : "none";
}

/** How many digits the person's PIN has (4 to 6), or null when it isn't known yet (a PIN set before step 44, or step 44 not run). */
export async function salaryPinLength(): Promise<number | null> {
  const n = await call<number | null>("salary_pin_length").catch(() => null);
  return typeof n === "number" && n >= 4 && n <= 6 ? n : null;
}

export const setSalaryPin = (pin: string, current?: string) => call<PinResult>("salary_pin_set", { p_pin: pin, p_current: current ?? null });
export const checkSalaryPin = (pin: string) => call<PinResult>("salary_pin_check", { p_pin: pin });
export const resetSalaryPin = (password: string, pin: string) => call<PinResult>("salary_pin_reset", { p_password: password, p_pin: pin });
export const lockSalary = () => call<void>("salary_pin_lock");
