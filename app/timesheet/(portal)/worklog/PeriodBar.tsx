import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { periodOf, periodLabel, shiftedDate, workHref, VIEWS, type WorkQuery } from "./query";

// Day / Week / Month, previous and next, and a Today button. These are plain links, so they work before any
// script has loaded and the address always says which period is showing.
export function PeriodBar({ query, today }: { query: WorkQuery; today: string }) {
  const period = periodOf(query, today);
  const next = shiftedDate(query, 1);
  const nextStart = periodOf({ ...query, date: next, from: "", to: "" }, today).from;
  const reset = { from: "", to: "", page: 1 } as const;
  const onToday = !period.custom && period.from <= today && today <= period.to;

  return (
    <nav aria-label="Time period" className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="View" className="inline-flex rounded-md border border-input p-0.5">
        {VIEWS.map((v) => {
          const active = !period.custom && query.view === v.id;
          return (
            <Button key={v.id} asChild size="sm" variant={active ? "default" : "ghost"} className="max-md:min-h-11 max-md:px-4">
              <Link href={workHref(query, { view: v.id, ...reset }, today)} aria-current={active ? "true" : undefined}>
                {v.label}
              </Link>
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="icon" className="max-md:size-11">
          <Link href={workHref(query, { date: shiftedDate(query, -1), ...reset }, today)} aria-label={`Previous ${query.view}`}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        {nextStart > today ? (
          <Button variant="outline" size="icon" className="max-md:size-11" disabled aria-label={`Next ${query.view}`}>
            <ChevronRight aria-hidden="true" />
          </Button>
        ) : (
          <Button asChild variant="outline" size="icon" className="max-md:size-11">
            <Link href={workHref(query, { date: next, ...reset }, today)} aria-label={`Next ${query.view}`}>
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
          <Link href={workHref(query, { date: today, ...reset }, today)} aria-disabled={onToday}>
            Today
          </Link>
        </Button>
      </div>

      <h2 className="text-base font-semibold" aria-live="polite">
        {periodLabel(query, today)}
        {period.custom && <span className="ml-2 text-sm font-normal text-muted-foreground">(custom range)</span>}
      </h2>
    </nav>
  );
}
