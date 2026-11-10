"use server";

import { revalidatePath } from "next/cache";
import { cancelRequest, createRequest, dayInfo, hoursOn, type DayInfo } from "@/lib/timesheet/compOff";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type CompOffResult = { ok: true; hours?: number } | { ok: false; error: string };

function fail(e: unknown): CompOffResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("comp-off", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => {
  revalidatePath("/timesheet/leave");
  revalidatePath("/timesheet/dashboard");
  revalidatePath("/timesheet/admin");
};

export async function earnCompOffAction(input: { workDate: string; hours: number; reason: string }): Promise<CompOffResult> {
  try {
    await createRequest(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelCompOffAction(id: string): Promise<CompOffResult> {
  try {
    await cancelRequest(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Your own logged hours on a date, to pre-fill the form. 0 when nothing is logged. */
export async function hoursOnDateAction(date: string): Promise<CompOffResult> {
  try {
    return { ok: true, hours: await hoursOn(date) };
  } catch (e) {
    return fail(e);
  }
}

/** Is this date a week off or holiday, and what is the state of your comp-off request for it? For the time log form. */
export async function dayInfoAction(date: string): Promise<{ ok: true; info: DayInfo } | { ok: false; error: string }> {
  try {
    return { ok: true, info: await dayInfo(date) };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("comp-off", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
