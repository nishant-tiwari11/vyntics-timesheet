// Which dates make up a pay month. Pure (no database), shared by the server and the browser.

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-based; day 0 of the next month = last day of this one
}

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "2026-11" for a YYYY-MM-DD date. */
export const monthKeyOf = (ymd: string) => ymd.slice(0, 7);

export const isMonthKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/**
 * The first and last day of the pay month named `month` ("YYYY-MM").
 * With a start day of 1 it is the calendar month. With any other start day (say 26) the month named 2026-11 runs from
 * 26 October to 25 November: a pay month is named after the month it ENDS in.
 */
export function periodForMonth(month: string, cycleStartDay: number): { start: string; end: string } {
  if (!isMonthKey(month)) throw new Error("Not a month.");
  const day = Math.min(Math.max(Math.trunc(cycleStartDay) || 1, 1), 28);
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (day === 1) return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(year, m))}` };
  const prev = shiftMonth(year, m, -1);
  return { start: `${prev.year}-${pad(prev.month)}-${pad(day)}`, end: `${month}-${pad(day - 1)}` };
}

/** The pay month that contains a date, for the same start-day rule. */
export function monthContaining(ymd: string, cycleStartDay: number): string {
  const day = Math.min(Math.max(Math.trunc(cycleStartDay) || 1, 1), 28);
  const year = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  if (day === 1 || Number(ymd.slice(8, 10)) < day) return `${year}-${pad(m)}`;
  const next = shiftMonth(year, m, 1);
  return `${next.year}-${pad(next.month)}`;
}
