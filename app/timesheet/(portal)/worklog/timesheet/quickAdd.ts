// The quick-add bar: turns a sentence such as "Log 8 hours for Friday" into a date and a length of time, so the
// Track time window can open already filled in. Plain code, no server-only imports.

import { addDays } from "@/lib/timesheet/dates";
import { PROJECTS } from "@/lib/timesheet/projects";
import { MAX_CELL_MINUTES } from "./gridModel";

export type QuickAdd = {
  /** Whole minutes, or null when the sentence has no length of time. */
  minutes: number | null;
  /** YYYY-MM-DD, or null when the sentence names no day (then it means today). */
  date: string | null;
  project: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const dayOfWeek = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** The latest day on or before `today` that falls on this weekday ("Friday" on a Tuesday = last Friday). */
function latest(weekday: number, today: string): string {
  return addDays(today, -((dayOfWeek(today) - weekday + 7) % 7));
}

export function parseQuickAdd(text: string, today: string, projects: readonly string[] = PROJECTS): QuickAdd {
  const t = text.toLowerCase();

  let minutes: number | null = null;
  const clock = /\b(\d{1,2}):([0-5]\d)\b/.exec(t);
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(t);
  const mins = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(t);
  const bare = /\blog\s+(\d+(?:[.,]\d+)?)\b/.exec(t);
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
  else if (hours) minutes = Math.round(parseFloat(hours[1].replace(",", ".")) * 60) + (mins ? Number(mins[1]) : 0);
  else if (mins) minutes = Number(mins[1]);
  else if (bare) minutes = Math.round(parseFloat(bare[1].replace(",", ".")) * 60);
  if (minutes !== null && (minutes <= 0 || minutes > MAX_CELL_MINUTES)) minutes = null;

  let date: string | null = null;
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso && iso[1] <= today) date = iso[1];
  else if (/\byesterday\b/.test(t)) date = addDays(today, -1);
  else if (/\btoday\b/.test(t)) date = today;
  else {
    const named = WEEKDAYS.findIndex((w) => new RegExp(`\\b(${w}|${w.slice(0, 3)})\\b`).test(t));
    if (named >= 0) date = latest(named, today);
  }

  const project = projects.find((p) => t.includes(p.toLowerCase())) ?? null;
  return { minutes, date, project };
}
