// The Work log page's settings, kept in the address so a view can be bookmarked, shared, and survives a refresh.
// Pure code (no server-only imports), so the server page, the client filters and the tests can all use it.

import { addDays, formatRange, formatYmd, isYmd, mondayOf, monthRange } from "@/lib/timesheet/dates";
import { PROJECTS } from "@/lib/timesheet/projects";

export const WORKLOG_PATH = "/timesheet/worklog";

export const VIEWS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];

export const STATUS_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;
export type StatusId = (typeof STATUS_OPTIONS)[number]["id"];

export const SORTS = [
  { id: "date", label: "Date" },
  { id: "project", label: "Project" },
  { id: "time", label: "Time" },
  { id: "duration", label: "Duration" },
  { id: "status", label: "Status" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export const SIZES = [10, 25, 50] as const;
export const DEFAULT_SIZE = 25;

/** A custom date range is cut to this many days, so one request can't ask for years of entries. */
export const MAX_RANGE_DAYS = 366;

export type WorkQuery = {
  view: ViewId;
  /** Any day inside the period being shown. */
  date: string;
  /** A custom date range; replaces the Day/Week/Month period when set. */
  from: string;
  to: string;
  /** "all" or one of the projects. */
  project: string;
  status: StatusId;
  q: string;
  sort: SortId;
  dir: "asc" | "desc";
  page: number;
  size: number;
};

export type Period = { from: string; to: string; custom: boolean };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Read the settings from an address. Anything unexpected falls back to the defaults. */
export function parseWorkQuery(raw: Record<string, string | string[] | undefined>, today: string): WorkQuery {
  const page = Number(one(raw.page));
  const size = Number(one(raw.size));
  const from = one(raw.from);
  const to = one(raw.to);
  const project = one(raw.project);
  return {
    view: VIEWS.find((v) => v.id === one(raw.view))?.id ?? "week",
    date: isYmd(one(raw.date)) ? (one(raw.date) as string) : today,
    from: isYmd(from) ? from : "",
    to: isYmd(to) ? to : "",
    project: (PROJECTS as readonly string[]).includes(project ?? "") ? (project as string) : "all",
    status: STATUS_OPTIONS.find((s) => s.id === one(raw.status))?.id ?? "all",
    q: (one(raw.q) ?? "").trim().slice(0, 60),
    sort: SORTS.find((s) => s.id === one(raw.sort))?.id ?? "date",
    dir: one(raw.dir) === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
    size: SIZES.find((n) => n === size) ?? DEFAULT_SIZE,
  };
}

/** The address for a set of settings. Defaults are left out to keep it short. */
export function workHref(query: WorkQuery, change: Partial<WorkQuery>, today: string, path = WORKLOG_PATH): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.view !== "week") params.set("view", next.view);
  if (next.date !== today) params.set("date", next.date);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.project !== "all") params.set("project", next.project);
  if (next.status !== "all") params.set("status", next.status);
  if (next.q) params.set("q", next.q);
  if (next.sort !== "date") params.set("sort", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.size !== DEFAULT_SIZE) params.set("size", String(next.size));
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

/** Is any filter (not the period) in use? */
export const hasFilters = (q: WorkQuery) => q.project !== "all" || q.status !== "all" || q.q !== "" || q.from !== "" || q.to !== "";

/** The filters off again, keeping the period being shown. */
export const clearedFilters: Pick<WorkQuery, "project" | "status" | "q" | "from" | "to" | "page"> = {
  project: "all",
  status: "all",
  q: "",
  from: "",
  to: "",
  page: 1,
};

function shiftMonth(ymd: string, delta: number): string {
  const month = Number(ymd.slice(5, 7)) - 1 + delta;
  return new Date(Date.UTC(Number(ymd.slice(0, 4)), month, 1)).toISOString().slice(0, 10);
}

/** The first and last day being shown. */
export function periodOf(query: WorkQuery, today: string): Period {
  if (query.from || query.to) {
    let from = query.from || monthRange(query.to).start;
    let to = query.to || (from > today ? from : today);
    if (from > to) [from, to] = [to, from];
    const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
    return { from: from < earliest ? earliest : from, to, custom: true };
  }
  if (query.view === "day") return { from: query.date, to: query.date, custom: false };
  if (query.view === "week") {
    const monday = mondayOf(query.date);
    return { from: monday, to: addDays(monday, 6), custom: false };
  }
  const { start, end } = monthRange(query.date);
  return { from: start, to: end, custom: false };
}

/** A day inside the previous (-1) or next (+1) period. */
export function shiftedDate(query: WorkQuery, delta: -1 | 1): string {
  if (query.view === "day") return addDays(query.date, delta);
  if (query.view === "week") return addDays(mondayOf(query.date), 7 * delta);
  return shiftMonth(monthRange(query.date).start, delta);
}

/** "Tuesday, 10 November 2026", "9 – 15 Nov 2026" or "November 2026". */
export function periodLabel(query: WorkQuery, today: string): string {
  const p = periodOf(query, today);
  if (p.custom) return formatRange(p.from, p.to);
  if (query.view === "day") return formatYmd(p.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (query.view === "month") return formatYmd(p.from, { month: "long", year: "numeric" });
  return formatRange(p.from, p.to);
}

/** Every date from `from` to `to`, inclusive (at most MAX_RANGE_DAYS). */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < MAX_RANGE_DAYS; d = addDays(d, 1)) days.push(d);
  return days;
}
