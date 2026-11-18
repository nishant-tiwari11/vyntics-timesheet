import "../dashboard/dashboard.css";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { activeProjectNames, allProjectNames } from "@/lib/timesheet/projectList";
import { CopyYesterdayButton } from "./CopyYesterdayButton";
import { loadWorkLog } from "./data";
import { LogList } from "./LogList";
import { RetryButton } from "./RetryButton";
import { ListSkeleton } from "./WorkLogSkeleton";
import { WorkLogFilters } from "./WorkLogFilters";
import { eachDay, parseWorkQuery, periodOf, type WorkQuery } from "./query";
import { DateRangeNavigator } from "./timesheet/DateRangeNavigator";
import { GridSkeleton } from "./timesheet/GridSkeleton";
import { LazyGrid } from "./timesheet/LazyGrid";
import { QuickAddBar } from "./timesheet/QuickAddBar";
import { RecurringButton } from "./timesheet/RecurringButton";
import { TimesheetHeader } from "./timesheet/TimesheetHeader";
import { TrackTimeButton, TrackTimeProvider } from "./timesheet/TrackTime";

export const metadata = { title: "Work log" };

// The Timesheet: a Day or Week grid of hours by project, with the detailed entries list underneath.
// Everything you choose (view, day, filters, search, sort, page) lives in the address.
export default async function WorkLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, raw, projects, everyProject] = await Promise.all([getCurrentUser(), searchParams, activeProjectNames(), allProjectNames()]);
  const today = todayInOffice();
  const parsed = parseWorkQuery(raw, today);
  const admin = user?.role === "admin";

  // The grid shows a day or a week. An old "month" address (or a custom range) falls back to the week of that date.
  const query: WorkQuery = { ...parsed, view: parsed.view === "day" ? "day" : "week", from: "", to: "" };
  const key = JSON.stringify(query);
  const period = periodOf(query, today);

  return (
    <TrackTimeProvider today={today}>
      <div className="ts-page ts-dash grid gap-5">
        <TimesheetHeader query={query} today={today} />

        <div className="flex flex-wrap items-center gap-3">
          <TrackTimeButton date={query.date <= today ? query.date : today} />
          <DateRangeNavigator query={query} today={today} />
          <div className="ml-auto">
            <RecurringButton />
          </div>
        </div>

        <QuickAddBar today={today} projects={projects} />

        <Suspense key={`grid-${key}`} fallback={<GridSkeleton days={query.view === "day" ? 1 : 7} />}>
          <TimesheetGrid query={query} days={eachDay(period.from, period.to)} projects={projects} />
        </Suspense>

        <section aria-labelledby="entries-title" className="grid gap-4 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="entries-title" className="text-base font-semibold">
                Entries
              </h2>
              <p className="ts-muted">{admin ? "Everyone's time logs. Edit, delete, approve or export them here." : "The detail behind the hours: edit, delete or export."}</p>
            </div>
            {!admin && <CopyYesterdayButton today={today} />}
          </div>
          <WorkLogFilters query={query} today={today} projects={everyProject} />
          <Suspense key={`list-${key}`} fallback={<ListSkeleton />}>
            <LogList query={query} />
          </Suspense>
        </section>
      </div>
    </TrackTimeProvider>
  );
}

async function TimesheetGrid({ query, days, projects }: { query: WorkQuery; days: string[]; projects: string[] }) {
  const res = await loadWorkLog(query);
  if (!res.ok) {
    return (
      <div className="ts-card ts-empty" role="alert">
        <strong>We couldn&apos;t load your timesheet</strong>
        <p>{res.error}</p>
        <RetryButton />
      </div>
    );
  }
  const { entries, me, today, truncated } = res.data;
  return (
    <>
      {truncated && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm" role="note">
          This period has more than 1,000 entries, so some are missing from the totals. Choose a shorter period.
        </p>
      )}
      <LazyGrid view={query.view === "day" ? "day" : "week"} days={days} entries={entries} myId={me.id} today={today} projects={projects} />
    </>
  );
}
