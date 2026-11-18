// The Admin audit log: one list of who did what and when, drawn from the portal's separate records (access changes,
// documents, expenses, payroll and approval decisions). Plain code with no server-only imports.

import { addDays, isYmd } from "@/lib/timesheet/dates";

export const SOURCES = [
  { id: "all", label: "Everything" },
  { id: "users", label: "Access & settings" },
  { id: "approvals", label: "Approvals" },
  { id: "documents", label: "Documents" },
  { id: "expenses", label: "Expenses" },
  { id: "payroll", label: "Payroll" },
] as const;
export type SourceId = (typeof SOURCES)[number]["id"];
export type EventSource = Exclude<SourceId, "all">;

export type AuditEvent = {
  /** Unique across sources, e.g. "users:12". */
  key: string;
  /** ISO time. */
  at: string;
  source: EventSource;
  /** Who did it (a name or an email). */
  actor: string;
  /** What was done, in words ("User added"). */
  action: string;
  /** What or who it was done to. */
  target: string;
  detail: string;
};

export const PAGE_SIZE = 50;
/** How many of the newest events are read from each record. */
export const WINDOW = 200;

export type AuditQuery = { source: SourceId; q: string; from: string; to: string; page: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Read the settings from an address; anything unexpected falls back to the defaults (everything, the last 30 days). */
export function parseAuditQuery(raw: Record<string, string | string[] | undefined>, today: string): AuditQuery {
  let from = isYmd(one(raw.from)) ? (one(raw.from) as string) : addDays(today, -29);
  let to = isYmd(one(raw.to)) ? (one(raw.to) as string) : today;
  if (from > to) [from, to] = [to, from];
  const page = Number(one(raw.page));
  return {
    source: SOURCES.find((s) => s.id === one(raw.source))?.id ?? "all",
    q: (one(raw.q) ?? "").trim().slice(0, 60),
    from,
    to,
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

export function auditHref(query: AuditQuery, change: Partial<AuditQuery>, today: string): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.source !== "all") params.set("source", next.source);
  if (next.q) params.set("q", next.q);
  if (next.from !== addDays(today, -29) || next.to !== today) {
    params.set("from", next.from);
    params.set("to", next.to);
  }
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return `/timesheet/admin/audit${qs ? `?${qs}` : ""}`;
}

/** "user_added" or "doc-verified" becomes "User added" or "Doc verified". Text that is already readable is left alone. */
export function humanize(action: string): string {
  const text = action.trim();
  if (!text) return "Changed";
  if (/\s/.test(text)) return text.charAt(0).toUpperCase() + text.slice(1);
  const words = text.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Put the lists together, keep what matches the search, newest first, without repeats. */
export function mergeAudit(lists: AuditEvent[][], opts: { q?: string } = {}): AuditEvent[] {
  const needle = (opts.q ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const out: AuditEvent[] = [];
  for (const e of lists.flat()) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    if (needle && !`${e.actor} ${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(needle)) continue;
    out.push(e);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE): { rows: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(Math.ceil(items.length / size), 1);
  const current = Math.min(Math.max(page, 1), pages);
  return { rows: items.slice((current - 1) * size, current * size), page: current, pages, total: items.length };
}

/** The start and end of a day range in office time (India), as ISO times for the database. */
export function dayBounds(from: string, to: string): { start: string; end: string } {
  return { start: `${from}T00:00:00+05:30`, end: `${to}T23:59:59.999+05:30` };
}
