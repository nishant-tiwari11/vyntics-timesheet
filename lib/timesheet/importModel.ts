// Reading an Excel sheet of time logs, as plain code with no database or file access, so it can be tested.
// The sheet uses the same columns as the Work log's Export Excel: Employee, Date, Project, Start, End, Hours, Description, Status.
// (Status is ignored: entries added by an admin are approved straight away. Hours is only used when Start and End are empty.)

import { isYmd } from "./dates";

export type ImportEmployee = { id: string; name: string; email: string };

export type ImportRow = { userId: string; person: string; date: string; project: string; start: string; end: string; text: string };

export type RowProblem = { /** The row number in the sheet (the header is row 1). */ row: number; message: string };

export type ParsedSheet = { rows: ImportRow[]; problems: RowProblem[]; skippedEmpty: number };

export const MAX_IMPORT_ROWS = 500;
export const TEXT_MAX = 500;
const EARLIEST = "2020-01-01";
const DEFAULT_START = "09:00";
const LAST_MINUTE = 23 * 60 + 59;

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Whatever a cell holds, as trimmed text. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** A date from a date cell, an Excel day number, or text such as 2026-11-17 or 17/11/2026. null when it isn't a real date. */
export function cellDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(EXCEL_EPOCH + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  const t = cellText(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(t);
  if (iso) {
    const ymd = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isYmd(ymd) ? ymd : null;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (dmy) {
    const ymd = `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
    return isYmd(ymd) ? ymd : null;
  }
  return null;
}

/** A time of day in minutes from "09:30", "9:30 AM", an Excel time (a fraction of a day) or a time cell. null when it isn't a time. */
export function cellTime(v: unknown): number | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") {
    if (v >= 0 && v < 1) return Math.round(v * 24 * 60) % (24 * 60);
    return null;
  }
  const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([ap]m)?$/i.exec(cellText(v));
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  }
  return h > 23 ? null : h * 60 + Number(m[2]);
}

const HEADERS: Record<string, string> = {
  employee: "person",
  name: "person",
  person: "person",
  email: "email",
  date: "date",
  project: "project",
  start: "start",
  "start time": "start",
  end: "end",
  "end time": "end",
  hours: "hours",
  description: "text",
  "what did you work on": "text",
  status: "status",
};

/**
 * Check every row of the sheet (the first row is the header). Rows that can't be used are reported with the reason and left
 * out; the rest are returned ready to save. Nothing here saves anything.
 */
export function parseImportRows(
  table: unknown[][],
  ctx: { employees: ImportEmployee[]; projects: string[]; today: string },
): ParsedSheet | { fatal: string } {
  if (table.length === 0) return { fatal: "The sheet is empty." };
  const columns = new Map<string, number>();
  table[0].forEach((h, i) => {
    const key = HEADERS[cellText(h).toLowerCase()];
    if (key && !columns.has(key)) columns.set(key, i);
  });
  const missing = [
    !columns.has("date") && "Date",
    !columns.has("project") && "Project",
    !columns.has("text") && "Description",
    !columns.has("person") && !columns.has("email") && "Employee (or Email)",
    !columns.has("start") && !columns.has("hours") && "Start and End (or Hours)",
  ].filter((m): m is string => !!m);
  if (missing.length > 0) return { fatal: `The first row must name these columns: ${missing.join(", ")}.` };

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS + 50) return { fatal: `The sheet has too many rows. Import up to ${MAX_IMPORT_ROWS} at a time.` };

  const get = (r: unknown[], key: string) => (columns.has(key) ? r[columns.get(key)!] : undefined);
  const byEmail = new Map(ctx.employees.map((e) => [e.email.trim().toLowerCase(), e]));
  const byName = new Map<string, ImportEmployee[]>();
  for (const e of ctx.employees) {
    const k = e.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const projects = new Map(ctx.projects.map((p) => [p.toLowerCase(), p]));

  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  let skippedEmpty = 0;

  body.forEach((r, i) => {
    const row = i + 2;
    const text = cellText(get(r, "text"));
    const projectRaw = cellText(get(r, "project"));
    const dateRaw = get(r, "date");
    // Blank lines and the "Total" line at the bottom of an exported sheet.
    if (!text && !projectRaw && cellText(dateRaw) === "") {
      skippedEmpty++;
      return;
    }
    const bad = (message: string) => void problems.push({ row, message });

    // Who
    const emailRaw = cellText(get(r, "email")).toLowerCase();
    const nameRaw = cellText(get(r, "person"));
    let who: ImportEmployee | undefined;
    if (emailRaw && byEmail.has(emailRaw)) who = byEmail.get(emailRaw);
    else if (nameRaw.includes("@") && byEmail.has(nameRaw.toLowerCase())) who = byEmail.get(nameRaw.toLowerCase());
    else if (nameRaw) {
      const found = byName.get(nameRaw.toLowerCase()) ?? [];
      if (found.length > 1) return bad(`Several employees are called "${nameRaw}". Use their email instead.`);
      who = found[0];
    }
    if (!who) return bad(emailRaw || nameRaw ? `No employee matches "${emailRaw || nameRaw}".` : "No employee on this row.");

    // When
    const date = cellDate(dateRaw);
    if (!date) return bad("The date isn't valid. Use a date such as 2026-11-17.");
    if (date > ctx.today) return bad("The date is in the future.");
    if (date < EARLIEST) return bad(`The date is before ${EARLIEST}.`);

    // Which project
    const project = projects.get(projectRaw.toLowerCase());
    if (!project) return bad(projectRaw ? `"${projectRaw}" isn't an active project.` : "No project on this row.");

    // From and to
    let start = cellTime(get(r, "start"));
    let end = cellTime(get(r, "end"));
    if (start === null && end === null) {
      const hours = Number(String(get(r, "hours") ?? "").replace(",", "."));
      if (!Number.isFinite(hours) || hours <= 0 || hours > 23.9) return bad("Give a Start and End time, or the Hours.");
      start = cellTime(DEFAULT_START)!;
      end = Math.min(start + Math.round(hours * 60), LAST_MINUTE);
    } else if (start === null || end === null) {
      return bad("Both the Start and the End time are needed.");
    }
    if (end <= start) return bad("The end time must be after the start time.");

    // What
    if (!text) return bad("The description is empty.");
    if (text.length > TEXT_MAX) return bad(`The description is longer than ${TEXT_MAX} characters.`);

    const entry: ImportRow = { userId: who.id, person: who.name, date, project, start: clock(start), end: clock(end), text };
    const key = `${entry.userId}|${date}|${entry.start}|${entry.end}|${project}`;
    if (seen.has(key)) return bad("The same entry (person, day, time and project) appears twice in the sheet.");
    seen.add(key);
    rows.push(entry);
  });

  if (rows.length > MAX_IMPORT_ROWS) return { fatal: `The sheet has ${rows.length} usable rows. Import up to ${MAX_IMPORT_ROWS} at a time.` };
  return { rows, problems, skippedEmpty };
}

/** The key that says "this person, day, time and project already has an entry". */
export const entryKey = (e: { userId: string; date: string; start: string; end: string; project: string }) => `${e.userId}|${e.date}|${e.start}|${e.end}|${e.project}`;
