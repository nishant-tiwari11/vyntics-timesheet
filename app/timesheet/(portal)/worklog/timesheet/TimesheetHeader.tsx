import Link from "next/link";
import { workHref, type WorkQuery } from "../query";

export const CALENDAR_PATH = "/timesheet/calendar";

// The page title with the Day | Week | Calendar switch, and a thin line under it. These are plain links, so they
// work before any script has loaded. "Calendar" goes to the existing Calendar page, which is not changed.
export function TimesheetHeader({ query, today, title = "Work log", subtitle = "Your hours by project and day, with the detail underneath.", embedded = false }: { query: WorkQuery; today: string; title?: string; subtitle?: string; /** Shown inside another page: a smaller heading and no Calendar link. */ embedded?: boolean }) {
  const tabs = [
    { label: "Day", href: workHref(query, { view: "day", page: 1 }, today), active: query.view === "day" },
    { label: "Week", href: workHref(query, { view: "week", page: 1 }, today), active: query.view === "week" },
    ...(embedded ? [] : [{ label: "Calendar", href: CALENDAR_PATH, active: false }]),
  ];
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {embedded ? <h2 className="ts-h2">{title}</h2> : <h1 className="ts-greeting">{title}</h1>}
        <p className="ts-muted">{subtitle}</p>
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
