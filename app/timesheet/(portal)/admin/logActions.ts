"use server";

import { revalidatePath } from "next/cache";
import { adminAddLog, adminDeleteLog, adminUpdateLog, type LogFields } from "@/lib/timesheet/logs";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Admins can add, change and delete any employee's time log on any past date, including days that are locked for
// employees. Each function checks for an admin on the server, and the database checks again.

export type AdminLogResult = { ok: true } | { ok: false; error: string };

export type AdminLogInput = { date: string; text: string; start: string; end: string; project: string };

const TEXT_MAX = 500;

function fail(e: unknown): AdminLogResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("admin logs", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

function toFields(input: AdminLogInput): LogFields {
  if (typeof input?.text === "string" && input.text.trim().length > TEXT_MAX) {
    throw new TimesheetError(`Keep the entry to ${TEXT_MAX} characters or fewer.`);
  }
  return { entry: input.text, logDate: input.date, start: input.start, end: input.end, project: input.project };
}

// Time logs show on several pages, and a change can create or change comp-off, so refresh them all.
function refresh() {
  for (const path of ["/timesheet/admin", "/timesheet/dashboard", "/timesheet/calendar", "/timesheet/events", "/timesheet/leave"]) {
    revalidatePath(path);
  }
}

export async function adminAddLogAction(userId: string, input: AdminLogInput): Promise<AdminLogResult> {
  try {
    await adminAddLog(userId, toFields(input));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function adminUpdateLogAction(id: string, input: AdminLogInput): Promise<AdminLogResult> {
  try {
    await adminUpdateLog(id, toFields(input));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function adminDeleteLogAction(id: string): Promise<AdminLogResult> {
  try {
    await adminDeleteLog(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
