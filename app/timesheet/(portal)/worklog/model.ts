// The Work log page's numbers and shapes: filtering, sorting, grouping by day, summary cards, CSV.
// Pure code (no server-only imports) so it can be tested on its own.

import { addDays, daysInclusive, isWeekend } from "@/lib/timesheet/dates";
import { EDIT_WINDOW_DAYS } from "@/lib/timesheet/rules";
import { eachDay, type SortId, type WorkQuery } from "./query";

/** Hours a full working day is expected to have (the same target the Dashboard uses). */
export const DAY_TARGET_HOURS = 8;

/** Show the "days left to edit" hint when this many days or fewer remain. */
export const LOCK_WARNING_DAYS = 3;

export type LogStatusId = "pending" | "approved" | "rejected";

export type Entry = {
  id: string;
  userId: string;
  person: string;
  date: string;
  /** "HH:MM" or "" for old entries without times. */
  start: string;
  end: string;
  hours: number | null;
  project: string;
  text: string;
  status: LogStatusId;
  noCompOff: boolean;
  reviewedAt: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2.5" / "3" */
export const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : String(round2(n)));

/** 2.5 → "2 h 30 min" */
export function fmtDuration(hours: number | null): string {
  if (hours == null) return "—";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "14:30" → "2:30 PM" */
export function clock12(time: string): string {
  if (!time) return "—";
  const h = Number(time.slice(0, 2));
  return `${h % 12 || 12}:${time.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

/** Whole days from a to b (b later = positive). */
export const dayDiff = (a: string, b: string) => daysInclusive(a, b) - 1;

/**
 * Days left to change a pending entry of your own before it locks (0 = today is the last day), or null when
 * it is already locked or no longer pending. An entry for day D can be changed until D + 7.
 */
export function daysLeftToEdit(entry: Pick<Entry, "date" | "status">, today: string): number | null {
  if (entry.status !== "pending") return null;
  const left = dayDiff(today, addDays(entry.date, EDIT_WINDOW_DAYS));
  return left < 0 ? null : left;
}

export const editHint = (left: number) => (left === 0 ? "Last day to edit" : `${left} ${left === 1 ? "day" : "days"} left to edit`);

/** Apply the project, status and search filters. (The period is already applied when loading.) */
export function filterEntries(entries: Entry[], query: Pick<WorkQuery, "project" | "status" | "q">): Entry[] {
  const term = query.q.toLowerCase();
  return entries.filter(
    (e) =>
      (query.project === "all" || e.project === query.project) &&
      (query.status === "all" || e.status === query.status) &&
      (!term || e.text.toLowerCase().includes(term) || e.project.toLowerCase().includes(term) || e.person.toLowerCase().includes(term))
  );
}

const STATUS_ORDER: Record<LogStatusId, number> = { pending: 0, approved: 1, rejected: 2 };

function compare(a: Entry, b: Entry, sort: SortId): number {
  switch (sort) {
    case "project":
      return a.project.localeCompare(b.project) || a.start.localeCompare(b.start);
    case "duration":
      return (a.hours ?? 0) - (b.hours ?? 0) || a.start.localeCompare(b.start);
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.start.localeCompare(b.start);
    default:
      return a.start.localeCompare(b.start) || a.person.localeCompare(b.person);
  }
}

export type DayGroup = {
  date: string;
  /** Entries on this day (all of them; a page may show only some). */
  entries: Entry[];
  /** Hours on this day that count (rejected entries don't). */
  total: number;
  /** A working day with no entry at all. */
  missing: boolean;
};

/**
 * Group entries by day. The Date column decides the order of the days; every other column sorts the entries
 * inside each day. `missing` days (working days with nothing logged) are added as empty groups.
 */
export function groupByDay(entries: Entry[], query: Pick<WorkQuery, "sort" | "dir">, missing: string[] = []): DayGroup[] {
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  for (const d of missing) if (!byDate.has(d)) byDate.set(d, []);

  const missingSet = new Set(missing);
  const sign = query.dir === "asc" ? 1 : -1;
  const dates = [...byDate.keys()].sort((a, b) => (query.sort === "date" ? sign : -1) * a.localeCompare(b));
  return dates.map((date) => {
    const list = [...(byDate.get(date) ?? [])].sort((a, b) => (query.sort === "date" ? 1 : sign) * compare(a, b, query.sort));
    return {
      date,
      entries: list,
      total: round2(list.reduce((sum, e) => sum + (e.status === "rejected" ? 0 : (e.hours ?? 0)), 0)),
      missing: list.length === 0 && missingSet.has(date),
    };
  });
}

export type PageSlice = { groups: (DayGroup & { shown: Entry[]; continued: boolean })[]; total: number; page: number; last: number; from: number; to: number };

/** One page of rows (an empty "missing" day counts as one row). A day can run over onto the next page. */
export function paginate(groups: DayGroup[], page: number, size: number): PageSlice {
  const rows = groups.flatMap((g): { group: DayGroup; entry: Entry | null }[] =>
    g.entries.length ? g.entries.map((entry) => ({ group: g, entry })) : [{ group: g, entry: null }]
  );
  const total = rows.length;
  const last = Math.max(Math.ceil(total / size), 1);
  const current = Math.min(Math.max(page, 1), last);
  const start = (current - 1) * size;
  const slice = rows.slice(start, start + size);

  const out: PageSlice["groups"] = [];
  for (const { group, entry } of slice) {
    const prev = out[out.length - 1];
    if (prev && prev.date === group.date) {
      if (entry) prev.shown.push(entry);
    } else {
      out.push({ ...group, shown: entry ? [entry] : [], continued: !!entry && group.entries[0] !== entry });
    }
  }
  return { groups: out, total, page: current, last, from: total ? start + 1 : 0, to: start + slice.length };
}

export type Summary = {
  total: number;
  target: number;
  remaining: number;
  workingDays: number;
  /** Working days up to today with nothing logged. */
  missingDays: string[];
  pendingApprovals: number;
};

/**
 * The numbers for the cards. `mine` are your own entries in the period. Working days exclude weekends,
 * holidays and festivals, and approved leave.
 */
export function summarize(opts: {
  mine: Entry[];
  from: string;
  to: string;
  today: string;
  offDays: Iterable<string>;
  leaveDays: Iterable<string>;
  pendingApprovals: number;
}): Summary {
  const off = new Set(opts.offDays);
  const leave = new Set(opts.leaveDays);
  const worked = new Set(opts.mine.map((e) => e.date));
  const working = eachDay(opts.from, opts.to).filter((d) => !isWeekend(d) && !off.has(d) && !leave.has(d));
  const total = round2(opts.mine.reduce((sum, e) => sum + (e.status === "rejected" ? 0 : (e.hours ?? 0)), 0));
  const target = working.length * DAY_TARGET_HOURS;
  return {
    total,
    target,
    remaining: Math.max(round2(target - total), 0),
    workingDays: working.length,
    missingDays: working.filter((d) => d <= opts.today && !worked.has(d)),
    pendingApprovals: opts.pendingApprovals,
  };
}

// ---------------------------- CSV ----------------------------

/** One CSV cell. Quotes are doubled, and a leading = + - @ is defused so a spreadsheet can't run it as a formula. */
export function csvCell(value: string | number | null): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(entries: Entry[], withPerson: boolean): string {
  const header = [withPerson ? "Employee" : null, "Date", "Project", "Start", "End", "Hours", "Description", "Status"].filter(
    (h): h is string => h !== null
  );
  const lines = entries.map((e) =>
    [withPerson ? e.person : null, e.date, e.project, e.start, e.end, e.hours, e.text, e.status]
      .filter((_, i) => withPerson || i !== 0)
      .map(csvCell)
      .join(",")
  );
  return `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
