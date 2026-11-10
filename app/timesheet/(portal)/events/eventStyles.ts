import type { EventColor, EventItem } from "@/lib/timesheet/eventTypes";

// Black, grays and an outline: the colour choices stay inside the portal's monochrome theme.
export const COLOR_CLASS: Record<EventColor, string> = {
  black: "border-transparent bg-foreground text-background",
  slate: "border-transparent bg-foreground/80 text-background",
  gray: "border-transparent bg-muted-foreground text-background",
  light: "border-border bg-muted text-foreground",
  outline: "border-dashed border-foreground bg-background text-foreground",
};

export const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "14:30" → "2:30 PM" */
export function clock(t: string): string {
  if (!t) return "";
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

export const hourLabel = (h: number) => clock(`${String(h).padStart(2, "0")}:00`).replace(":00", "");

/** Does this item touch that day? */
export const onDay = (e: EventItem, day: string) => e.start <= day && day <= e.end;

/** The part of a timed event that falls on one day, in minutes since midnight (a multi-day event is cut per day). */
export function segment(e: EventItem, day: string): { from: number; to: number } | null {
  if (e.allDay || !onDay(e, day)) return null;
  return { from: day === e.start ? mins(e.startTime) : 0, to: day === e.end ? mins(e.endTime) : 24 * 60 };
}
