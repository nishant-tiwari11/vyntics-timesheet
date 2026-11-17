"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatYmd, isYmd } from "@/lib/timesheet/dates";
import { periodOf, shiftedDate, workHref, type WorkQuery } from "../query";

/** "07 Nov 2026" for one day, "02 – 08 Nov 2026" or "30 Nov – 06 Dec 2026" for a week. */
export function rangeLabel(from: string, to: string): string {
  const day = (d: string) => formatYmd(d, { day: "2-digit" });
  const month = (d: string) => formatYmd(d, { month: "short" });
  const year = (d: string) => formatYmd(d, { year: "numeric" });
  if (from === to) return `${day(from)} ${month(from)} ${year(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day(from)} – ${day(to)} ${month(to)} ${year(to)}`;
  return `${day(from)} ${month(from)}${from.slice(0, 4) === to.slice(0, 4) ? "" : ` ${year(from)}`} – ${day(to)} ${month(to)} ${year(to)}`;
}

const toDate = (ymd: string) => new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// [←] [calendar  02 – 08 Nov 2026] [→]  and the "Return to this week" link. One step is a day in the Day view
// and a week (Monday to Sunday) in the Week view. The arrows are links; the middle opens a date picker.
// You can't step past the current period: nothing can be logged for the future.
export function DateRangeNavigator({ query, today }: { query: WorkQuery; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const period = periodOf(query, today);
  const day = query.view === "day";
  const unit = day ? "day" : "week";
  const next = shiftedDate(query, 1);
  const canGoNext = periodOf({ ...query, date: next }, today).from <= today;
  const onCurrent = period.from <= today && today <= period.to;
  const go = (date: string) => workHref(query, { date, page: 1 }, today);

  return (
    <>
      <div className="inline-flex items-center rounded-md border border-input bg-background">
        <Button asChild variant="ghost" size="icon" className="rounded-r-none max-md:size-11">
          <Link href={go(shiftedDate(query, -1))} aria-label={`Previous ${unit}`}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="min-w-44 justify-center gap-2 rounded-none font-normal tabular-nums max-md:min-h-11" aria-label={`Choose a date. Showing ${rangeLabel(period.from, period.to)}`}>
              <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
              {rangeLabel(period.from, period.to)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              weekStartsOn={1}
              defaultMonth={toDate(query.date)}
              selected={toDate(query.date)}
              disabled={{ after: toDate(today) }}
              onSelect={(picked) => {
                if (!picked) return;
                const ymd = toYmd(picked);
                if (!isYmd(ymd)) return;
                setOpen(false);
                router.push(go(ymd));
              }}
            />
          </PopoverContent>
        </Popover>

        {canGoNext ? (
          <Button asChild variant="ghost" size="icon" className="rounded-l-none max-md:size-11">
            <Link href={go(next)} aria-label={`Next ${unit}`}>
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="rounded-l-none max-md:size-11" disabled aria-label={`Next ${unit}`}>
            <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </div>

      {!onCurrent && (
        <Link href={go(today)} className="text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900 max-md:py-3">
          {day ? "Return to today" : "Return to this week"}
        </Link>
      )}
    </>
  );
}
