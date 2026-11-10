// Which view and date the Events calendar shows, kept in the address (?view=week&on=2026-11-05).
// Pure functions, shared by the server page and the browser.
import { addDays, formatYmd, mondayOf, monthGrid, monthKey } from "@/lib/timesheet/dates";

export const VIEWS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];

export type EventsQuery = { view: ViewId; on: string };

const BASE = "/timesheet/events";

export function eventsHref(view: ViewId, on: string, today: string): string {
  const params = new URLSearchParams();
  if (view !== "month") params.set("view", view);
  if (on !== today) params.set("on", on);
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/** `ymd` moved by whole months, keeping the day where possible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ymd: string, months: number): string {
  const index = Number(ymd.slice(0, 4)) * 12 + (Number(ymd.slice(5, 7)) - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = Number(monthGrid(year, month).last.slice(8));
  return `${monthKey(year, month)}-${String(Math.min(Number(ymd.slice(8)), last)).padStart(2, "0")}`;
}

/** The first and last date that must be loaded to draw this view. */
export function rangeFor(q: EventsQuery): { from: string; to: string } {
  if (q.view === "day") return { from: q.on, to: q.on };
  if (q.view === "week") {
    const from = mondayOf(q.on);
    return { from, to: addDays(from, 6) };
  }
  const grid = monthGrid(Number(q.on.slice(0, 4)), Number(q.on.slice(5, 7)));
  return { from: grid.gridStart, to: grid.gridEnd };
}

export function shift(q: EventsQuery, dir: 1 | -1): string {
  if (q.view === "day") return addDays(q.on, dir);
  if (q.view === "week") return addDays(q.on, 7 * dir);
  return addMonths(q.on, dir);
}

export function titleFor(q: EventsQuery): string {
  if (q.view === "day") return formatYmd(q.on, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (q.view === "week") {
    const from = mondayOf(q.on);
    const to = addDays(from, 6);
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    return sameMonth
      ? `${formatYmd(from, { day: "numeric" })} – ${formatYmd(to, { day: "numeric", month: "long", year: "numeric" })}`
      : `${formatYmd(from, { day: "numeric", month: "short" })} – ${formatYmd(to, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return formatYmd(q.on, { month: "long", year: "numeric" });
}
