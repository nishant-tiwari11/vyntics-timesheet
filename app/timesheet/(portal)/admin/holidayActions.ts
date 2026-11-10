"use server";

import { revalidatePath } from "next/cache";
import { createHoliday, deleteHoliday, importHolidays, markYearReviewed, updateHoliday, type ImportResult } from "@/lib/timesheet/holidays";
import type { HolidayInput } from "@/lib/timesheet/holidayTypes";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Every function below checks for an admin on the server (and the database checks again). Hiding buttons is only for convenience.

export type HolidayResult = { ok: true; message?: string; import?: ImportResult } | { ok: false; error: string };

function fail(e: unknown): HolidayResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("holidays", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// Holidays show on several pages and change leave day counts, so refresh them all.
function refresh() {
  for (const path of ["/timesheet/admin", "/timesheet/dashboard", "/timesheet/calendar", "/timesheet/events", "/timesheet/leave"]) {
    revalidatePath(path);
  }
}

export async function createHolidayAction(input: HolidayInput): Promise<HolidayResult> {
  try {
    await createHoliday(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateHolidayAction(id: string, input: HolidayInput): Promise<HolidayResult> {
  try {
    await updateHoliday(id, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHolidayAction(id: string): Promise<HolidayResult> {
  try {
    await deleteHoliday(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function importHolidaysAction(csv: string): Promise<HolidayResult> {
  try {
    const result = await importHolidays(csv);
    if (result.added > 0) refresh();
    return { ok: true, import: result };
  } catch (e) {
    return fail(e);
  }
}

export async function markYearReviewedAction(year: number): Promise<HolidayResult> {
  try {
    const n = await markYearReviewed(year);
    refresh();
    return { ok: true, message: `${n} ${n === 1 ? "holiday" : "holidays"} marked as reviewed.` };
  } catch (e) {
    return fail(e);
  }
}
