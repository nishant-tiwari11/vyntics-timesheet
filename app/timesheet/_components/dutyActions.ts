"use server";

import { startDuty, stopDuty } from "@/lib/timesheet/duty";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Going on and off duty: the signed-in person only (the database functions act for them and refuse anyone else).
export type DutyResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): DutyResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("duty", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function startDutyAction(location: string): Promise<DutyResult> {
  try {
    await startDuty(location);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function stopDutyAction(): Promise<DutyResult> {
  try {
    await stopDuty();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
