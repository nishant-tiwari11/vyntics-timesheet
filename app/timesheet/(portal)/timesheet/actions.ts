"use server";

import { logError } from "@/lib/timesheet/log";
import { TimesheetError } from "@/lib/timesheet/errors";
import { deleteRow, ensureWeek, reopenWeek, saveRow, submitWeek } from "@/lib/timesheet/weeks";
import type { DayHours } from "@/lib/timesheet/types";

// No revalidatePath here: autosave must not re-render the page under the person's fingers.

export type Failure = { ok: false; error: string; code?: "conflict" };

function fail(e: unknown): Failure {
  if (e instanceof TimesheetError) return { ok: false, error: e.message, code: e.code };
  logError("timesheet action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** Save one row. Creates the week first if this is the person's first change in it. */
export async function saveRowAction(input: {
  weekStart: string;
  weekId: string | null;
  rowId: string | null;
  project: string;
  days: Partial<DayHours>;
  position: number;
}): Promise<{ ok: true; weekId: string; rowId: string } | Failure> {
  try {
    let weekId = input.weekId;
    if (!weekId) {
      const week = await ensureWeek(input.weekStart); // only now is the week created
      if (week.status !== "draft" && week.status !== "sent_back") {
        throw new TimesheetError("This week is submitted or approved, so it can't be changed.", "conflict");
      }
      weekId = week.id;
    }
    const row = await saveRow(weekId, input.project, input.days, {
      rowId: input.rowId ?? undefined,
      position: input.position,
    });
    return { ok: true, weekId, rowId: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRowAction(rowId: string): Promise<{ ok: true } | Failure> {
  try {
    await deleteRow(rowId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function submitWeekAction(weekId: string): Promise<{ ok: true } | Failure> {
  try {
    await submitWeek(weekId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenWeekAction(weekId: string): Promise<{ ok: true } | Failure> {
  try {
    await reopenWeek(weekId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
