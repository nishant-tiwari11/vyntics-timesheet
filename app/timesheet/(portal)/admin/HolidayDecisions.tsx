"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { Holiday } from "@/lib/timesheet/holidayTypes";
import { formatYmd } from "@/lib/timesheet/dates";
import { OfficeOffButtons } from "./HolidayControls";

const when = (date: string, today: string) => {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
};

// A public holiday or festival is on the calendar for everyone, but it stays an ordinary working day until an admin says the office
// is closed. This asks, for the next two weeks, so it is decided before the day arrives.
export function HolidayDecisions({ holidays, today }: { holidays: Holiday[]; today: string }) {
  if (holidays.length === 0) return null;
  return (
    <section className="grid gap-3 rounded-xl border border-orange-300 bg-orange-50/60 p-4 dark:border-orange-500/40 dark:bg-orange-500/10" aria-label="Holidays to decide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">{holidays.length === 1 ? "A holiday is coming up" : `${holidays.length} holidays are coming up`}</h2>
            <p className="text-sm text-muted-foreground">Is the office closed? Until you decide, the day stays a normal working day for hours, leave and pay.</p>
          </div>
        </div>
        <Link href="/timesheet/admin?tab=holidays" className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          All holidays
        </Link>
      </div>
      <ul className="grid gap-2">
        {holidays.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
            <span className="min-w-0">
              <span className="block font-medium">{h.name}</span>
              <span className="text-xs text-muted-foreground">
                {when(h.date, today)} · {formatYmd(h.date, { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </span>
            <OfficeOffButtons holiday={h} />
          </li>
        ))}
      </ul>
    </section>
  );
}
