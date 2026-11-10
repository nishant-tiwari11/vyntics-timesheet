import "server-only";
import { cache } from "react";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { addDays, mondayOf, monthRange, todayInOffice } from "@/lib/timesheet/dates";
import { listApprovedLeaveBetween, listEmployees } from "@/lib/timesheet/admin";
import { listAllLogs, listLogPage, listLogsBetween, listMyHoursByDate, type LogPage } from "@/lib/timesheet/logs";
import type { LogStatus } from "@/lib/timesheet/types";
import type { LogQuery, RangeId } from "./logQuery";
import { listApprovedRequestsBetween, listRequests } from "@/lib/timesheet/requests";
import { offDatesBetween } from "@/lib/timesheet/holidays";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export const DAY_TARGET = 8;

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

export const loadRequests = cache(() => safe(() => listRequests()));

export type WeekStats = {
  hours: number;
  target: number;
  met: number;
  under: number;
  /** Working days so far this week (Mon to today, up to Friday), not counting approved leave. */
  elapsed: number;
};

/** This week's numbers for the stat cards, from your own work-log hours. */
export const loadWeekStats = cache(() =>
  safe(async (): Promise<WeekStats> => {
    const today = todayInOffice();
    const monday = mondayOf(today);
    const [hoursByDate, requests, offList] = await Promise.all([
      listMyHoursByDate(monday, addDays(monday, 6)),
      listRequests(),
      offDatesBetween(monday, addDays(monday, 6)).catch(() => [] as string[]),
    ]);
    const holidays = new Set(offList);

    const onLeave = (date: string) =>
      requests.some((r) => r.type === "leave" && r.status === "approved" && r.from_date <= date && date <= r.to_date);

    let hours = 0;
    let workdays = 0;
    let met = 0;
    let elapsed = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      hours += hoursByDate[date] ?? 0;
      if (i >= 5 || onLeave(date) || holidays.has(date)) continue; // weekends, leave and holidays don't count toward the target
      workdays += 1;
      if (date > today) continue;
      elapsed += 1;
      if ((hoursByDate[date] ?? 0) >= DAY_TARGET) met += 1;
    }
    return {
      hours: Math.round(hours * 100) / 100,
      target: workdays * DAY_TARGET,
      met,
      under: elapsed - met,
      elapsed,
    };
  })
);

export type Snapshot = { id: string; name: string; hours: number; onLeave: boolean; holiday: boolean };

/** Admin only: every employee's hours today against the daily target. */
export const loadSnapshot = cache(() =>
  safe(async (): Promise<Snapshot[]> => {
    const today = todayInOffice();
    const [people, logs, leave, offToday] = await Promise.all([
      listEmployees(),
      listAllLogs(today),
      listApprovedLeaveBetween(today, today),
      offDatesBetween(today, today).catch(() => [] as string[]),
    ]);
    const hours = new Map<string, number>();
    for (const l of logs.filter((l) => l.status !== "rejected")) hours.set(l.user_id, (hours.get(l.user_id) ?? 0) + (l.hours ?? 0));
    const away = new Set(leave.map((l) => l.user_id));
    return people.map((p) => ({
      id: p.id,
      name: p.name,
      hours: Math.round((hours.get(p.id) ?? 0) * 100) / 100,
      onLeave: away.has(p.id),
      holiday: offToday.length > 0,
    }));
  })
);

export function rangeDates(range: RangeId): { from: string | null; to: string | null } {
  const today = todayInOffice();
  if (range === "today") return { from: today, to: today };
  if (range === "week") {
    const monday = mondayOf(today);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (range === "month") {
    const { start, end } = monthRange(today);
    return { from: start, to: end };
  }
  return { from: null, to: null };
}

export function loadLogPage(scope: "mine" | "all", query: LogQuery): Promise<Loaded<LogPage>> {
  const { from, to } = rangeDates(query.range);
  return safe(() =>
    listLogPage({
      scope,
      from,
      to,
      status: query.status === "all" ? null : (query.status as LogStatus),
      search: query.q,
      page: query.page,
      pageSize: query.size,
    })
  );
}

export function loadCalendarLogs(scope: "mine" | "all", from: string, to: string) {
  return safe(() => listLogsBetween({ scope, from, to }));
}

export function loadCalendarOff(scope: "mine" | "all", from: string, to: string) {
  return safe(() => listApprovedRequestsBetween({ scope, from, to }));
}

/** Public holiday and festival dates in a range. Never throws: if they can't load, nothing is skipped. */
export async function loadOffDates(from: string, to: string): Promise<string[]> {
  try {
    return await offDatesBetween(from, to);
  } catch {
    return [];
  }
}
