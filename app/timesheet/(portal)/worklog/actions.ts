"use server";

import { revalidatePath } from "next/cache";
import { assertDate, TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { copyLogsToToday, getLogHints, listMyLogsOnDate, type LogHints } from "@/lib/timesheet/logs";

// Small helpers for the Work log page and its add form. Every one of them works only on the signed-in user's own entries.

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("work log action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** What to pre-fill in the add form, and which earlier day "Copy yesterday's entries" would copy. */
export async function logHintsAction(): Promise<Result<{ hints: LogHints }>> {
  try {
    return { ok: true, hints: await getLogHints() };
  } catch (e) {
    return fail(e);
  }
}

/** Your entries on one day, so the form can warn about overlapping times. */
export async function dayLogsAction(date: string): Promise<Result<{ entries: { id: string; start: string; end: string; project: string }[] }>> {
  try {
    return { ok: true, entries: await listMyLogsOnDate(assertDate(date, "date")) };
  } catch (e) {
    return fail(e);
  }
}

/** Copy an earlier day's entries to today. */
export async function copyDayAction(fromDate: string): Promise<Result<{ count: number }>> {
  try {
    const count = await copyLogsToToday(fromDate);
    revalidatePath("/timesheet/worklog");
    revalidatePath("/timesheet/dashboard");
    revalidatePath("/timesheet/leave");
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}
