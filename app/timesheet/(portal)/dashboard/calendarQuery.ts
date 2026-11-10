// Shared by the server section and the client calendar, so it holds no server-only code.
import { addDays, formatRange, formatYmd, mondayOf, monthRange } from "@/lib/timesheet/dates";
import { logHref, type LogQuery } from "./logQuery";

export const CAL_VIEWS = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "list", label: "List" },
] as const;
export type CalView = (typeof CAL_VIEWS)[number]["id"];

/** `on` is any date inside the period being shown (YYYY-MM-DD). */
export type CalQuery = { view: CalView; on: string };

/** One time log, trimmed to what the calendar needs. */
export type CalEvent = {
  id: string;
  userId: string;
  who: string;
  date: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  hours: number | null;
  project: string;
  text: string;
  noCompOff: boolean;
  status: "pending" | "approved" | "rejected";
};

/** Approved leave or work from home, covering from..to (inclusive). */
export type CalOff = {
  id: string;
  userId: string;
  who: string;
  type: "leave" | "wfh";
  /** Leave paid for with comp-off days. */
  compOff: boolean;
  from: string;
  to: string;
  note: string;
};

/** The first day of the month containing `ymd`, moved by `months`. */
function addMonths(ymd: string, months: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** Monday of the first row of the month grid (6 rows of 7 days). */
export function monthGridStart(on: string): string {
  return mondayOf(monthRange(on).start);
}

/** Which dates the server has to load for a view. */
export function calRange(q: CalQuery): { from: string; to: string } {
  if (q.view === "week") {
    const from = mondayOf(q.on);
    return { from, to: addDays(from, 6) };
  }
  if (q.view === "day") return { from: q.on, to: q.on };
  if (q.view === "list") {
    const { start, end } = monthRange(q.on);
    return { from: start, to: end };
  }
  const from = monthGridStart(q.on);
  return { from, to: addDays(from, 41) };
}

export function calTitle(q: CalQuery): string {
  if (q.view === "week") {
    const from = mondayOf(q.on);
    return formatRange(from, addDays(from, 6));
  }
  if (q.view === "day") return formatYmd(q.on, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return formatYmd(q.on, { month: "long", year: "numeric" });
}

/** The date to show after pressing Previous (-1) or Next (1). */
export function calShift(q: CalQuery, dir: -1 | 1): string {
  if (q.view === "week") return addDays(q.on, 7 * dir);
  if (q.view === "day") return addDays(q.on, dir);
  return addMonths(q.on, dir);
}

/** A dashboard address with the calendar settings changed. Keeps the table settings. */
export function calHref(log: LogQuery, cal: CalQuery, today: string, change: Partial<CalQuery> = {}): string {
  const next = { ...cal, ...change };
  const [base, existing = ""] = logHref(log).split("#")[0].split("?");
  const params = new URLSearchParams(existing);
  if (next.view !== "month") params.set("cal", next.view);
  if (next.on !== today) params.set("on", next.on);
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ""}#calendar`;
}
