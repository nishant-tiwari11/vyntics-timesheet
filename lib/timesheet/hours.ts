import { addDays } from "./dates";
import { DAY_KEYS, type WeekWithRows } from "./types";

type RowHours = Partial<Record<(typeof DAY_KEYS)[number], number>>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours per weekday (Mon..Sun) summed across all rows of a week. */
export function dayTotals(rows: RowHours[] | undefined): number[] {
  return DAY_KEYS.map((k) => round2((rows ?? []).reduce((sum, r) => sum + (r[k] ?? 0), 0)));
}

export function weekTotal(rows: RowHours[] | undefined): number {
  return round2(dayTotals(rows).reduce((a, b) => a + b, 0));
}

/** Total hours that fall on days between `start` and `end` (inclusive) across the given weeks. */
export function hoursBetween(weeks: WeekWithRows[], start: string, end: string): number {
  let total = 0;
  for (const w of weeks) {
    dayTotals(w.timesheet_rows).forEach((h, i) => {
      const date = addDays(w.week_start, i);
      if (date >= start && date <= end) total += h;
    });
  }
  return round2(total);
}
