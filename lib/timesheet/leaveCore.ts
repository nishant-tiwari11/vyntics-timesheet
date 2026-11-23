// Leave rules that need no database: shared by the server (to decide and to count) and the browser (to explain what an
// approval will do). Dates are YYYY-MM-DD; a "day" may be a half (0.5).
import { addDays, daysInclusive, isWeekend } from "./dates";

export type DayPart = "full" | "first_half" | "second_half";
export type LeaveKind = "paid" | "comp_off" | "unpaid";

export const KIND_LABEL: Record<LeaveKind, string> = { paid: "Paid leave", comp_off: "Comp-off leave", unpaid: "Unpaid leave (loss of pay)" };
export const PART_LABEL: Record<DayPart, string> = { full: "Full day", first_half: "First half", second_half: "Second half" };

export const isDayPart = (v: unknown): v is DayPart => v === "full" || v === "first_half" || v === "second_half";
export const isLeaveKind = (v: unknown): v is LeaveKind => v === "paid" || v === "comp_off" || v === "unpaid";

export const partFraction = (p: DayPart): number => (p === "full" ? 1 : 0.5);

export type LeaveDay = { date: string; days: number };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The days a leave request costs: every working day in the range (weekends and holidays are free), each worth a whole day, or a
 * half when it is a half-day request. Only a single day can be a half day.
 */
export function leaveDays(from: string, to: string, part: DayPart, off: ReadonlySet<string>): LeaveDay[] {
  const out: LeaveDay[] = [];
  const total = daysInclusive(from, to);
  const days = from === to ? partFraction(part) : 1;
  for (let i = 0; i < total; i++) {
    const date = addDays(from, i);
    if (!isWeekend(date) && !off.has(date)) out.push({ date, days });
  }
  return out;
}

export const sumDays = (days: LeaveDay[]) => round(days.reduce((n, d) => n + d.days, 0));

/** Days per calendar month ("2026-11" -> 1.5). */
export function byMonth(days: LeaveDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) m.set(d.date.slice(0, 7), round((m.get(d.date.slice(0, 7)) ?? 0) + d.days));
  return m;
}

export type PaidMonth = { month: string; quota: number; used: number; left: number; asking: number; over: number };

/**
 * Paid leave for each month a request touches: the monthly allowance, how much is already used, how much is left, how much
 * this request asks for, and how far it goes over the allowance (0 when it fits). Nothing carries over between months.
 */
export function paidLeaveStatus(quota: number, usedByMonth: ReadonlyMap<string, number>, asking: LeaveDay[]): PaidMonth[] {
  return [...byMonth(asking)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ask]) => {
      const used = usedByMonth.get(month) ?? 0;
      const left = Math.max(0, round(quota - used));
      return { month, quota, used, left, asking: ask, over: Math.max(0, round(ask - left)) };
    });
}

/** "1 day", "0.5 day", "2.5 days", "-1 day" */
export const dayWord = (n: number) => `${n} ${Math.abs(n) === 1 || Math.abs(n) === 0.5 ? "day" : "days"}`;
