// Comp-off rules that need no database: shared by the server (to validate) and the browser (to explain).
import { addDays, daysInclusive, isWeekend } from "./dates";

export type CompOffStatus = "pending" | "approved" | "rejected" | "cancelled";

export type CompOffSettings = {
  halfDayHours: number;
  fullDayHours: number;
  expiryDays: number;
  /** Most days one person can earn in a month. 0 means no limit. */
  monthlyCap: number;
};

export const DEFAULT_SETTINGS: CompOffSettings = { halfDayHours: 4, fullDayHours: 8, expiryDays: 90, monthlyCap: 2 };

export type CompOffRequest = {
  id: string;
  userId: string;
  name: string;
  workDate: string;
  hours: number;
  reason: string;
  status: CompOffStatus;
  credit: number;
  expiresOn: string | null;
  adminNote: string;
  createdAt: string;
  /** Created automatically from a time log. */
  auto: boolean;
  /** The time log it came from (task, project, hours), if it still exists. */
  entry: { task: string; project: string; hours: number | null } | null;
  /** Approved, but the time log changed afterwards: an admin must approve the new amount. */
  needsReapproval: boolean;
  proposedHours: number | null;
  proposedCredit: number | null;
};

/** An approved earning: this much comp-off, usable up to and including `expiresOn`. */
export type CompOffCredit = { id: string; credit: number; expiresOn: string };

export type CompOffBalance = {
  earned: number;
  used: number;
  /** Credit that ran out of time unused. */
  expired: number;
  /** Credit that can still be spent, not counting days already booked. */
  available: number;
  /** Part of `available` that expires within EXPIRING_SOON_DAYS. */
  expiringSoon: number;
  /** The soonest date any unspent credit runs out, and how much runs out then. Null when nothing is left to spend. */
  nextExpiry: { date: string; days: number } | null;
  /** Days of comp-off leave taken that no credit covers yet: what the person owes, to be earned back by working a weekend or holiday. */
  shortfall: number;
  /** What the person has right now: available credit, or minus what they owe. Can be negative. */
  balance: number;
};

export const EXPIRING_SOON_DAYS = 14;

const round = (n: number) => Math.round(n * 100) / 100;

/** Half day, full day, or nothing (0) for the hours worked. */
export function creditForHours(hours: number, s: CompOffSettings): 0 | 0.5 | 1 {
  if (hours >= s.fullDayHours) return 1;
  if (hours >= s.halfDayHours) return 0.5;
  return 0;
}

/** The working days a comp-off leave request spends: every day in the range except weekends and holidays. */
export function daysSpent(from: string, to: string, offDays: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const total = daysInclusive(from, to);
  for (let i = 0; i < total; i++) {
    const d = addDays(from, i);
    if (!isWeekend(d) && !offDays.has(d)) out.push(d);
  }
  return out;
}

/**
 * The balance, worked out from scratch.
 * Each leave day spends one day of credit (half a day for a half-day leave), oldest expiry first, and a credit can only pay
 * for a day on or before its expiry date. A day that no credit covers is a debt (shortfall): the person took the leave first,
 * and credit earned later pays it back automatically (earning date does not matter, only expiry). Because nothing is stored, a rejected or cancelled leave request simply stops being listed and its days
 * come back, and an expired credit can never be spent.
 */
export function computeBalance(credits: CompOffCredit[], useDates: (string | { date: string; days: number })[], today: string): CompOffBalance {
  const sorted = [...credits].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id));
  const left = new Map(sorted.map((c) => [c.id, c.credit]));
  let shortfall = 0;

  const uses = useDates.map((u) => (typeof u === "string" ? { date: u, days: 1 } : u)).sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, days } of uses) {
    let need = days;
    for (const c of sorted) {
      if (need <= 0) break;
      const have = left.get(c.id) ?? 0;
      if (have <= 0 || c.expiresOn < date) continue;
      const take = Math.min(need, have);
      left.set(c.id, have - take);
      need -= take;
    }
    shortfall += Math.max(need, 0);
  }

  const soon = addDays(today, EXPIRING_SOON_DAYS);
  let available = 0;
  let expired = 0;
  let expiringSoon = 0;
  let nextExpiry: { date: string; days: number } | null = null;
  for (const c of sorted) {
    const rest = left.get(c.id) ?? 0;
    if (c.expiresOn < today) expired += rest;
    else {
      available += rest;
      if (c.expiresOn <= soon) expiringSoon += rest;
      // `sorted` is oldest expiry first, so the first credit with something left sets the date; later ones with the same date add to it.
      if (rest > 0) {
        if (!nextExpiry) nextExpiry = { date: c.expiresOn, days: rest };
        else if (nextExpiry.date === c.expiresOn) nextExpiry.days += rest;
      }
    }
  }
  const earned = sorted.reduce((n, c) => n + c.credit, 0);
  return {
    earned: round(earned),
    used: round(earned - available - expired),
    expired: round(expired),
    available: round(available),
    expiringSoon: round(expiringSoon),
    nextExpiry: nextExpiry ? { date: nextExpiry.date, days: round(nextExpiry.days) } : null,
    shortfall: round(shortfall),
    balance: round(available - shortfall),
  };
}

/** "1 day", "0.5 day", "2.5 days" */
export const daysText = (n: number) => `${n} ${n === 1 || n === 0.5 ? "day" : "days"}`;

/** What to say when a comp-off request needs more days than you have: what is wrong, and what to do about it. */
export function compOffShortMessage(have: number, need: number): string {
  if (have <= 0) {
    return "You don't have any comp-off available right now. Apply for normal leave instead, or earn comp-off by working on a weekly off day or a holiday.";
  }
  const more = Math.round((need - have) * 10) / 10;
  const half = have < 1 ? " Comp-off is spent one full day at a time, so a half day can't cover a day off by itself." : "";
  return `You have ${daysText(have)} of comp-off, and this request needs ${daysText(need)}.${half} Apply for normal leave instead, or earn ${daysText(more)} more first.`;
}
