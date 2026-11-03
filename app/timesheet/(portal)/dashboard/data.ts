import { logError } from "@/lib/timesheet/log";
import "server-only";
import { cache } from "react";
import { TimesheetError } from "@/lib/timesheet/errors";
import { mondayOf, monthRange, todayInOffice } from "@/lib/timesheet/dates";
import { hoursBetween } from "@/lib/timesheet/hours";
import { getWeek, listMyWeeks } from "@/lib/timesheet/weeks";
import { listRequests } from "@/lib/timesheet/requests";
import { listLogs } from "@/lib/timesheet/logs";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

// Each section loads independently, so one failure shows an error in that section only.
async function safe<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
    if (!(e instanceof TimesheetError)) logError("dashboard", e);
    return { ok: false, error };
  }
}

// React cache() = one database call per request, however many sections use it.

/** This week's data. Read-only: opening the dashboard never creates a week. */
export const loadWeek = cache(() =>
  safe(async () => {
    const weekStart = mondayOf(todayInOffice());
    return { weekStart, week: await getWeek(weekStart) };
  })
);

export const loadMonthHours = cache(() =>
  safe(async () => {
    const { start, end } = monthRange(todayInOffice());
    const weeks = await listMyWeeks(mondayOf(start), mondayOf(end));
    return hoursBetween(weeks, start, end);
  })
);

export const loadRequests = cache(() => safe(() => listRequests()));

export const loadLogs = cache(() => safe(() => listLogs(8)));
