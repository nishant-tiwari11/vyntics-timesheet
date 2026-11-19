// The Admin reports: what is asked for (from the address), and how the numbers are worked out. Plain code with no server-only
// imports, so the page, the exports and the tests all use the same thing.

import { csvCell } from "@/app/timesheet/(portal)/worklog/model";
import { addDays, formatYmd, isWeekend, isYmd, mondayOf, monthRange, workingDays } from "@/lib/timesheet/dates";
import { dailyTarget } from "@/lib/timesheet/settings";

export const REPORTS = [
  { id: "hours", label: "Hours" },
  { id: "under", label: "Under target" },
  { id: "leave", label: "Leave & comp-off" },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];

export const GROUPS = [
  { id: "employee", label: "By employee" },
  { id: "project", label: "By project" },
  { id: "date", label: "By date" },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];

export const PRESETS = [
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

/** The most days one report may cover, so one request can't ask for years of data. */
export const MAX_RANGE_DAYS = 366;

export type ReportQuery = {
  report: ReportId;
  from: string;
  to: string;
  /** "all" or an employee's id. */
  employee: string;
  /** "all" or a project name. */
  project: string;
  group: GroupId;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function presetRange(id: PresetId, today: string): { from: string; to: string } {
  switch (id) {
    case "this-week":
      return { from: mondayOf(today), to: addDays(mondayOf(today), 6) };
    case "last-week":
      return { from: addDays(mondayOf(today), -7), to: addDays(mondayOf(today), -1) };
    case "last-month": {
      const { start } = monthRange(today);
      const { start: prevStart, end: prevEnd } = monthRange(addDays(start, -1));
      return { from: prevStart, to: prevEnd };
    }
    default: {
      const { start, end } = monthRange(today);
      return { from: start, to: end };
    }
  }
}

/** Read a report request from an address. Anything unexpected falls back to the defaults (this month, hours, everyone). */
export function parseReportQuery(raw: Record<string, string | string[] | undefined>, today: string): ReportQuery {
  const month = presetRange("this-month", today);
  let from = isYmd(one(raw.from)) ? (one(raw.from) as string) : month.from;
  let to = isYmd(one(raw.to)) ? (one(raw.to) as string) : month.to;
  if (from > to) [from, to] = [to, from];
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;
  const employee = one(raw.employee);
  const project = one(raw.project);
  return {
    report: REPORTS.find((r) => r.id === one(raw.report))?.id ?? "hours",
    from,
    to,
    employee: employee && UUID.test(employee) ? employee : "all",
    project: project && project !== "all" && project.length <= 60 ? project : "all",
    group: GROUPS.find((g) => g.id === one(raw.group))?.id ?? "employee",
  };
}

/** The address for a report, with some settings changed. Defaults are left out to keep it short. */
export function reportHref(query: ReportQuery, change: Partial<ReportQuery>, today: string, path = "/timesheet/admin/reports"): string {
  const next = { ...query, ...change };
  const month = presetRange("this-month", today);
  const params = new URLSearchParams();
  if (next.report !== "hours") params.set("report", next.report);
  if (next.from !== month.from || next.to !== month.to) {
    params.set("from", next.from);
    params.set("to", next.to);
  }
  if (next.employee !== "all") params.set("employee", next.employee);
  if (next.project !== "all") params.set("project", next.project);
  if (next.group !== "employee") params.set("group", next.group);
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

// ---------------------------- Tables ----------------------------

export type Column = { key: string; label: string; numeric?: boolean };
export type Cell = string | number;
export type ReportTable = {
  title: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  /** A bold row at the bottom. */
  totals?: Record<string, Cell>;
  /** An explanation shown under the table. */
  note?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type LogRow = { userId: string; name: string; date: string; project: string; hours: number; status: string };

/** Hours from time logs, grouped by employee, project or date. Rejected entries don't count. */
export function buildHoursTable(logs: LogRow[], group: GroupId): ReportTable {
  const counted = logs.filter((l) => l.status !== "rejected");
  const total = round2(counted.reduce((n, l) => n + l.hours, 0));

  type Acc = { hours: number; entries: number; people: Set<string>; days: Set<string>; label: string };
  const groups = new Map<string, Acc>();
  for (const l of counted) {
    const key = group === "employee" ? l.userId : group === "project" ? l.project || "No project" : l.date;
    const acc = groups.get(key) ?? { hours: 0, entries: 0, people: new Set<string>(), days: new Set<string>(), label: group === "employee" ? l.name : key };
    acc.hours += l.hours;
    acc.entries += 1;
    acc.people.add(l.userId);
    acc.days.add(l.date);
    groups.set(key, acc);
  }
  const list = [...groups.values()];

  if (group === "employee") {
    return {
      title: "Hours by employee",
      columns: [
        { key: "employee", label: "Employee" },
        { key: "days", label: "Days logged", numeric: true },
        { key: "entries", label: "Entries", numeric: true },
        { key: "hours", label: "Hours", numeric: true },
        { key: "average", label: "Hours per day", numeric: true },
      ],
      rows: list
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label))
        .map((a) => ({ employee: a.label, days: a.days.size, entries: a.entries, hours: round2(a.hours), average: a.days.size ? round2(a.hours / a.days.size) : 0 })),
      totals: { employee: "Total", days: "", entries: counted.length, hours: total, average: "" },
    };
  }
  if (group === "project") {
    return {
      title: "Hours by project",
      columns: [
        { key: "project", label: "Project" },
        { key: "people", label: "People", numeric: true },
        { key: "entries", label: "Entries", numeric: true },
        { key: "hours", label: "Hours", numeric: true },
        { key: "share", label: "Share (%)", numeric: true },
      ],
      rows: list
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label))
        .map((a) => ({ project: a.label, people: a.people.size, entries: a.entries, hours: round2(a.hours), share: total > 0 ? round2((a.hours / total) * 100) : 0 })),
      totals: { project: "Total", people: "", entries: counted.length, hours: total, share: total > 0 ? 100 : 0 },
    };
  }
  return {
    title: "Hours by date",
    columns: [
      { key: "date", label: "Date" },
      { key: "people", label: "People", numeric: true },
      { key: "entries", label: "Entries", numeric: true },
      { key: "hours", label: "Hours", numeric: true },
    ],
    rows: list
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((a) => ({ date: a.label, people: a.people.size, entries: a.entries, hours: round2(a.hours) })),
    totals: { date: "Total", people: "", entries: counted.length, hours: total },
  };
}

/**
 * The working days of one person in a range that have already happened: not a weekend, a holiday or a day on approved leave,
 * and not after `today`. This is how many days they were expected to log.
 */
export function expectedWorkingDays(opts: { from: string; to: string; today: string; offDays: ReadonlySet<string>; leaveDays: ReadonlySet<string> }): number {
  const end = opts.to < opts.today ? opts.to : opts.today;
  let n = 0;
  for (let d = opts.from; d <= end; d = addDays(d, 1)) {
    if (!isWeekend(d) && !opts.offDays.has(d) && !opts.leaveDays.has(d)) n += 1;
  }
  return n;
}

/** People whose logged hours are below the daily target times their working days so far, biggest shortfall first. */
export function buildUnderTargetTable(opts: {
  people: { id: string; name: string }[];
  hoursById: ReadonlyMap<string, number>;
  workingDaysById: ReadonlyMap<string, number>;
  target?: number;
}): ReportTable {
  const target = opts.target ?? dailyTarget();
  const rows = opts.people
    .map((p) => {
      const days = opts.workingDaysById.get(p.id) ?? 0;
      const expected = round2(days * target);
      const logged = round2(opts.hoursById.get(p.id) ?? 0);
      return { employee: p.name, days, expected, logged, short: round2(expected - logged), percent: expected > 0 ? Math.round((logged / expected) * 100) : 100 };
    })
    .filter((r) => r.short > 0)
    .sort((a, b) => b.short - a.short || a.employee.localeCompare(b.employee));
  return {
    title: "Under target",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "days", label: "Working days", numeric: true },
      { key: "expected", label: `Target (${target} h a day)`, numeric: true },
      { key: "logged", label: "Logged (h)", numeric: true },
      { key: "short", label: "Short by (h)", numeric: true },
      { key: "percent", label: "% of target", numeric: true },
    ],
    rows,
    totals: rows.length ? { employee: "Total", days: "", expected: round2(rows.reduce((n, r) => n + r.expected, 0)), logged: round2(rows.reduce((n, r) => n + r.logged, 0)), short: round2(rows.reduce((n, r) => n + r.short, 0)), percent: "" } : undefined,
    note: `Working days are weekdays up to today that aren't holidays or approved leave. Rejected hours don't count. Only people below the target are listed.`,
  };
}

export type LeaveRequestRow = { userId: string; type: string; compOff: boolean; from: string; to: string };

/** Days taken in the range (working days only), per person, split into leave, comp-off leave and work from home. */
export function leaveDaysByPerson(requests: LeaveRequestRow[], range: { from: string; to: string }, offDays: Iterable<string>): Map<string, { leave: number; compOffLeave: number; wfh: number }> {
  const off = new Set(offDays);
  const out = new Map<string, { leave: number; compOffLeave: number; wfh: number }>();
  for (const r of requests) {
    const from = r.from > range.from ? r.from : range.from;
    const to = r.to < range.to ? r.to : range.to;
    if (from > to) continue;
    const days = workingDays(from, to, off);
    if (days === 0) continue;
    const acc = out.get(r.userId) ?? { leave: 0, compOffLeave: 0, wfh: 0 };
    if (r.type === "wfh") acc.wfh += days;
    else if (r.compOff) acc.compOffLeave += days;
    else acc.leave += days;
    out.set(r.userId, acc);
  }
  return out;
}

export type CompOffRow = { earned: number; used: number; available: number };

export function buildLeaveTable(opts: { people: { id: string; name: string }[]; days: ReadonlyMap<string, { leave: number; compOffLeave: number; wfh: number }>; compOff: ReadonlyMap<string, CompOffRow> }): ReportTable {
  const rows = opts.people
    .map((p) => {
      const d = opts.days.get(p.id) ?? { leave: 0, compOffLeave: 0, wfh: 0 };
      const c = opts.compOff.get(p.id) ?? { earned: 0, used: 0, available: 0 };
      return { employee: p.name, leave: d.leave, compLeave: d.compOffLeave, wfh: d.wfh, earned: round2(c.earned), used: round2(c.used), available: round2(c.available) };
    })
    .filter((r) => r.leave + r.compLeave + r.wfh + r.earned + r.used + r.available > 0)
    .sort((a, b) => a.employee.localeCompare(b.employee));
  const sum = (k: "leave" | "compLeave" | "wfh" | "earned" | "used" | "available") => round2(rows.reduce((n, r) => n + r[k], 0));
  return {
    title: "Leave and comp-off",
    columns: [
      { key: "employee", label: "Employee" },
      { key: "leave", label: "Leave taken (days)", numeric: true },
      { key: "compLeave", label: "Comp-off leave (days)", numeric: true },
      { key: "wfh", label: "Work from home (days)", numeric: true },
      { key: "earned", label: "Comp-off earned", numeric: true },
      { key: "used", label: "Comp-off used", numeric: true },
      { key: "available", label: "Comp-off available", numeric: true },
    ],
    rows,
    totals: rows.length ? { employee: "Total", leave: sum("leave"), compLeave: sum("compLeave"), wfh: sum("wfh"), earned: sum("earned"), used: sum("used"), available: sum("available") } : undefined,
    note: "The portal has no yearly leave allowance, so leave shows days TAKEN in the dates chosen (working days only, approved requests only), not a remaining balance. Comp-off earned, used and available are real balances as of today.",
  };
}

// ---------------------------- Export ----------------------------

/** The table as CSV text (with a byte-order mark so Excel reads accents). Text starting with = + - @ can't run as a formula. */
export function tableToCsv(table: ReportTable): string {
  const head = table.columns.map((c) => csvCell(c.label)).join(",");
  const line = (row: Record<string, Cell>) => table.columns.map((c) => csvCell(row[c.key] ?? "")).join(",");
  const lines = [head, ...table.rows.map(line), ...(table.totals ? [line(table.totals)] : [])];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const rangeLabel = (from: string, to: string) =>
  from === to ? formatYmd(from, { day: "numeric", month: "short", year: "numeric" }) : `${formatYmd(from, { day: "numeric", month: "short", year: "numeric" })} to ${formatYmd(to, { day: "numeric", month: "short", year: "numeric" })}`;
