// The numbers behind the Day / Week grid: which cell is editable, how typed hours turn into a saved entry, and
// the totals. Pure code (no server-only imports) so it can be tested on its own.
//
// The grid is a view over the existing work-log entries. One cell = one project on one day. A cell holds at most
// one entry that the grid will edit; the entry keeps its start time and gets a new end time, so nothing in the
// backend changes (an entry still has a start, an end, a description and a project).

import { addDays } from "@/lib/timesheet/dates";
import { isProject, PROJECTS } from "@/lib/timesheet/projects";
import { LOCKED_MESSAGE, isLocked } from "@/lib/timesheet/rules";
import type { LogInput } from "../../dashboard/actions";
import type { Entry } from "../model";

/** A new entry starts here when the day has nothing else on it. */
export const DEFAULT_START = "09:00";
/** The longest a single cell can be: 00:00 to 23:59, because an entry can't run past midnight. */
export const MAX_CELL_MINUTES = 23 * 60 + 59;

const pad = (n: number) => String(n).padStart(2, "0");

/** 330 → "5:30". */
export const fmtMinutes = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

/** "07:30" → 450. */
export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** 450 → "07:30". */
export const toClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * What a person types in a cell: "5:30", "5.5", "5,5", "5", "5h". Empty means zero.
 * Returns whole minutes, or null when it isn't a duration (or is longer than a day).
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(",", ".");
  if (t === "") return 0;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : /^(\d+(?:\.\d+)?)\s*h?$/.test(t) ? Math.round(parseFloat(t) * 60) : null;
  return minutes === null || minutes > MAX_CELL_MINUTES ? null : minutes;
}

/** How long an entry is, in minutes. The start and end time win; very old entries only have hours. */
export function entryMinutes(e: Pick<Entry, "start" | "end" | "hours">): number {
  if (e.start && e.end) return Math.max(toMinutes(e.end) - toMinutes(e.start), 0);
  return Math.round((e.hours ?? 0) * 60);
}

export type CellState = "editable" | "locked" | "future" | "multi";

export type Cell = {
  date: string;
  minutes: number;
  /** Entries in this cell. Rejected ones are left out: they don't count towards the hours. */
  entries: Entry[];
  state: CellState;
  /** Why the cell can't be changed (empty when it can). */
  reason: string;
};

export type GridRow = {
  /** A project from the list, or "" for old entries that have none. */
  project: string;
  cells: Cell[];
  /** Every entry of the row in the period, rejected ones included, for the notes. */
  entries: Entry[];
  /** No cell of this row can be changed any more (approved, or past the 7-day window). */
  locked: boolean;
};

function cellOf(project: string, date: string, mine: Entry[], today: string): Cell {
  const entries = mine.filter((e) => e.project === project && e.date === date && e.status !== "rejected");
  const minutes = entries.reduce((sum, e) => sum + entryMinutes(e), 0);
  const base = { date, minutes, entries };
  if (date > today) return { ...base, state: "future", reason: "You can't log time for a future date." };
  if (!isProject(project)) return { ...base, state: "locked", reason: "This entry has no project. Edit it in the entries list below." };
  if (isLocked(date, today)) return { ...base, state: "locked", reason: LOCKED_MESSAGE };
  if (entries.some((e) => e.status === "approved")) return { ...base, state: "locked", reason: "Approved entries can't be changed." };
  if (entries.length > 1) return { ...base, state: "multi", reason: "This cell has several entries. Change them in the entries list below." };
  return { ...base, state: "editable", reason: "" };
}

/**
 * The grid's rows: every project that has an entry in the period (in the order of the project list), plus the
 * projects the person added by hand. Only the signed-in user's own entries count.
 */
export function buildRows(opts: { entries: Entry[]; myId: string; days: string[]; today: string; extra?: string[] }): GridRow[] {
  const mine = opts.entries.filter((e) => e.userId === opts.myId);
  const used = new Set(mine.map((e) => e.project));
  const names = [...PROJECTS.filter((p) => used.has(p) || opts.extra?.includes(p)), ...(used.has("") ? [""] : [])];
  return names.map((project) => {
    const cells = opts.days.map((d) => cellOf(project, d, mine, opts.today));
    const open = cells.filter((c) => c.state !== "future");
    return {
      project,
      cells,
      entries: mine.filter((e) => e.project === project),
      locked: open.length > 0 && open.every((c) => c.state === "locked"),
    };
  });
}

/** A start time for a `minutes`-long entry that fits before midnight. */
function fit(start: number, minutes: number): number {
  return Math.max(Math.min(start, MAX_CELL_MINUTES - minutes), 0);
}

export type SavePlan =
  | { kind: "none" }
  | { kind: "delete"; id: string }
  | { kind: "update"; id: string; input: LogInput }
  | { kind: "add"; input: LogInput };

/**
 * What saving `minutes` into a cell means. Zero deletes the cell's entry, a cell with no entry gets a new one
 * (placed right after whatever else you logged that day, or at 09:00), and a cell with one entry keeps its start
 * and gets a new end. `others` are your other entries on the same day (used only to place a new entry).
 */
export function planSave(cell: Cell, minutes: number, project: string, others: Pick<Entry, "end">[]): SavePlan {
  if (cell.state !== "editable" || minutes === cell.minutes || minutes < 0 || minutes > MAX_CELL_MINUTES) return { kind: "none" };
  const [entry] = cell.entries;

  if (minutes === 0) return entry ? { kind: "delete", id: entry.id } : { kind: "none" };

  if (entry) {
    const start = fit(entry.start ? toMinutes(entry.start) : toMinutes(DEFAULT_START), minutes);
    return {
      kind: "update",
      id: entry.id,
      input: { date: cell.date, text: entry.text, start: toClock(start), end: toClock(start + minutes), project },
    };
  }

  const ends = others.map((o) => (o.end ? toMinutes(o.end) : 0));
  const start = fit(Math.max(toMinutes(DEFAULT_START), ...ends), minutes);
  return { kind: "add", input: { date: cell.date, text: project, start: toClock(start), end: toClock(start + minutes), project } };
}

/** The days shown: seven for a week, one for a day. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

// Layout shared by the grid and its loading skeleton. It lives here, not in TimesheetRow, because that file is a
// client component and the skeleton is rendered on the server (a server component can't call a client function).

/** The column sizes shared by the header, every row and the totals row, so they line up. */
export const gridColumns = (days: number) => `minmax(240px,1fr) 44px repeat(${days}, 88px) 80px 48px`;

/** The first column is stuck to the left while the rest scrolls sideways on a small screen. */
export const STICKY = "sticky left-0 z-10";
