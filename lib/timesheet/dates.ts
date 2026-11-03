// All dates in this portal are plain "YYYY-MM-DD" strings. We never pass Date objects to the database.

// Office time zone. Must match public.portal_today() in the database.
export const OFFICE_TIME_ZONE = "Asia/Kolkata";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(ymd: string): [number, number, number] | null {
  const m = YMD.exec(ymd);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const real = dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  return real ? [y, mo, d] : null;
}

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && parts(value) !== null;
}

export function isMonday(ymd: string): boolean {
  const p = parts(ymd);
  return !!p && new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() === 1;
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(ymd: string, days: number): string {
  const p = parts(ymd);
  if (!p) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}

/** The Monday on or before the given date. */
export function mondayOf(ymd: string): string {
  const p = parts(ymd);
  if (!p) throw new Error(`Invalid date: ${ymd}`);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
}

/** Today's date in the office time zone, as YYYY-MM-DD. */
export function todayInOffice(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Number of days from `from` to `to`, counting both ends (weekends included). */
export function daysInclusive(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return 0;
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.round(ms / 86_400_000) + 1;
}

/** First and last day of the month containing `ymd`. */
export function monthRange(ymd: string): { start: string; end: string } {
  const p = parts(ymd);
  if (!p) throw new Error(`Invalid date: ${ymd}`);
  const start = `${ymd.slice(0, 8)}01`;
  const end = new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10);
  return { start, end };
}

/** en-GB formatting of a YYYY-MM-DD string (no time zone drift). */
export function formatYmd(ymd: string, opts: Intl.DateTimeFormatOptions): string {
  const p = parts(ymd);
  if (!p) return ymd;
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(
    new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  );
}

/** "5 Nov 2026" or "5 Nov – 7 Nov 2026". */
export function formatRange(from: string, to: string): string {
  const d = { day: "numeric", month: "short" } as const;
  if (from === to) return formatYmd(from, { ...d, year: "numeric" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatYmd(from, sameYear ? d : { ...d, year: "numeric" })} – ${formatYmd(to, { ...d, year: "numeric" })}`;
}

/** "Tuesday, 3 November 2026" for today in the office time zone. */
export function formatTodayLong(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function greeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: OFFICE_TIME_ZONE, hour: "numeric", hour12: false }).format(new Date())
  ) % 24;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "14:05" – the time of a timestamp in the office time zone. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Parses "YYYY-MM" (e.g. from a URL). Returns null if it isn't a real month. */
export function parseMonth(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!m) return null;
  const year = +m[1];
  if (year < 2000 || year > 2100) return null;
  return { year, month: +m[2] };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The visible calendar grid: Monday on or before the 1st, to the Sunday on or after the last day. */
export function monthGrid(year: number, month: number) {
  const first = `${monthKey(year, month)}-01`;
  const { end: last } = monthRange(first);
  const gridStart = mondayOf(first);
  const gridEnd = addDays(mondayOf(last), 6);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  return { first, last, gridStart, gridEnd, days };
}

/** "3 Nov 2026" - the calendar date of a timestamp in the office time zone. */
export function formatInstantDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
