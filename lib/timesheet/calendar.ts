import "server-only";
import { db, requireUser } from "./auth";
import { TimesheetError, toError } from "./errors";
import { monthGrid } from "./dates";
import type { Request } from "./types";

export type MonthData = {
  gridStart: string;
  gridEnd: string;
  /** Hours per day (only days with hours appear). */
  hoursByDate: Record<string, number>;
  /** Your pending and approved requests that overlap the grid. */
  requests: Request[];
  /** Dates with at least one work log entry. */
  logDates: string[];
};

/**
 * Everything the calendar needs for one month, for the whole visible grid
 * (Monday on or before the 1st → Sunday on or after the last day).
 * Two queries in parallel, no matter how many weeks the grid covers.
 */
export async function getMonthData(year: number, month: number): Promise<MonthData> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new TimesheetError("Please choose a valid month.");
  }
  const { gridStart, gridEnd } = monthGrid(year, month);
  const me = await requireUser();
  const supabase = await db();

  const [requestsRes, logsRes] = await Promise.all([
    supabase
      .from("requests")
      .select("*")
      .eq("user_id", me.id)
      .in("status", ["pending", "approved"])
      .lte("from_date", gridEnd)
      .gte("to_date", gridStart)
      .order("from_date", { ascending: true }),
    supabase
      .from("work_logs")
      .select("log_date, hours")
      .eq("user_id", me.id)
      .neq("status", "rejected")
      .gte("log_date", gridStart)
      .lte("log_date", gridEnd),
  ]);

  if (requestsRes.error) throw toError(requestsRes.error, "Couldn't load your requests. Please try again.");
  if (logsRes.error) throw toError(logsRes.error, "Couldn't load your work log. Please try again.");

  // Hours come from the "time spent" on each work-log entry.
  const hoursByDate: Record<string, number> = {};
  for (const log of logsRes.data) {
    if (log.hours) hoursByDate[log.log_date] = Math.round(((hoursByDate[log.log_date] ?? 0) + log.hours) * 100) / 100;
  }

  return {
    gridStart,
    gridEnd,
    hoursByDate,
    requests: requestsRes.data,
    logDates: [...new Set(logsRes.data.map((l) => l.log_date))],
  };
}
