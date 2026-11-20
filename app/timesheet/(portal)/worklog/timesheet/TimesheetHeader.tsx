import Link from "next/link";
import { workHref, type WorkQuery } from "../query";

export const CALENDAR_PATH = "/timesheet/calendar";

// The page title with the Day | Week | Calendar switch, and a thin line under it. These are plain links, so they
// work before any script has loaded. "Calendar" goes to the existing Calendar page, which is not changed.
export function TimesheetHeader({ query, today }: { query: WorkQuery; today: string }) {
  const tabs = [
    { label: "Day", href: workHref(query, { view: "day", page: 1 }, today), active: query.view === "day" },
    { label: "Week", href: workHref(query, { view: "week", page: 1 }, today), active: query.view === "week" },
    { label: "Calendar", href: CALENDAR_PATH, active: false },
  ];
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="ts-greeting">Work log</h1>
        <p className="ts-muted">Your hours by project and day, with the detail underneath.</p>
      </div>
      <nav aria-label="Timesheet view" className="inline-flex overflow-hidden rounded-[var(--radius)] border border-input bg-background">
        {tabs.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/30 max-md:min-h-11 ${i > 0 ? "border-l" : ""} ${
              t.active ? "bg-foreground text-background" : "text-foreground/80 hover:bg-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
