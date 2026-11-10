import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDays, formatYmd, mondayOf, monthGrid } from "@/lib/timesheet/dates";
import { cn } from "@/lib/utils";
import { addMonths, eventsHref, type EventsQuery } from "./eventsQuery";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** The small month in the sidebar. Choosing a day jumps the main calendar to it, in the current view. */
export default function MiniMonth({ q, today }: { q: EventsQuery; today: string }) {
  const grid = monthGrid(Number(q.on.slice(0, 4)), Number(q.on.slice(5, 7)));
  const week = new Set(Array.from({ length: 7 }, (_, i) => addDays(mondayOf(q.on), i)));
  const inRange = (d: string) => (q.view === "week" ? week.has(d) : d === q.on);
  const view = q.view === "month" ? "month" : q.view;
  const href = (on: string) => eventsHref(view, on, today);

  return (
    <div aria-label="Mini calendar">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">{formatYmd(q.on, { month: "long", year: "numeric" })}</h2>
        <div className="flex">
          <Link
            href={href(addMonths(q.on, -1))}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href={href(addMonths(q.on, 1))}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="py-1" aria-hidden="true">
            {d}
          </span>
        ))}
        {grid.days.map((d) => (
          <Link
            key={d}
            href={href(d)}
            aria-label={formatYmd(d, { weekday: "long", day: "numeric", month: "long" })}
            aria-current={d === today ? "date" : undefined}
            className={cn(
              "mx-auto my-0.5 flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors hover:bg-accent",
              d.slice(0, 7) !== q.on.slice(0, 7) && "text-muted-foreground/70",
              inRange(d) && "bg-accent font-medium text-foreground",
              d === today && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            )}
          >
            {Number(d.slice(8))}
          </Link>
        ))}
      </div>
    </div>
  );
}
