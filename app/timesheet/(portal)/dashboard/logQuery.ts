// Shared by the server table and the client dropdowns, so it holds no server-only code.

export const RANGES = [
  { id: "week", label: "This week" },
  { id: "today", label: "Today" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

export const STATUS_FILTERS = [
  { id: "all", label: "All statuses" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];

export const PAGE_SIZES = [5, 10, 25] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type LogQuery = {
  range: RangeId;
  status: StatusFilter;
  size: number;
  page: number;
  q: string;
};

export const DEFAULT_QUERY: LogQuery = { range: "week", status: "all", size: DEFAULT_PAGE_SIZE, page: 1, q: "" };

/** The dashboard address for a set of table settings. Defaults are left out to keep the address short. */
export function logHref(query: LogQuery, change: Partial<LogQuery> = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.range !== DEFAULT_QUERY.range) params.set("range", next.range);
  if (next.status !== DEFAULT_QUERY.status) params.set("status", next.status);
  if (next.size !== DEFAULT_QUERY.size) params.set("size", String(next.size));
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return `/timesheet/dashboard${qs ? `?${qs}` : ""}#logs`;
}
