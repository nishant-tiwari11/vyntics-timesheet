import "../dashboard/dashboard.css";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { AddLogButton } from "../dashboard/LogDialog";
import { CopyYesterdayButton } from "./CopyYesterdayButton";
import { LogList } from "./LogList";
import { PeriodBar } from "./PeriodBar";
import { SummaryCards } from "./SummaryCards";
import { ListSkeleton, SummarySkeleton } from "./WorkLogSkeleton";
import { WorkLogFilters } from "./WorkLogFilters";
import { parseWorkQuery } from "./query";

export const metadata = { title: "Work log" };

// The Work log: pick a day, week or month, see the totals, and work through the entries grouped by day.
// Everything you choose (period, filters, search, sort, page) lives in the address.
export default async function WorkLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, raw] = await Promise.all([getCurrentUser(), searchParams]);
  const today = todayInOffice();
  const query = parseWorkQuery(raw, today);
  const key = JSON.stringify(query);
  const admin = user?.role === "admin";

  return (
    <div className="ts-page ts-dash grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ts-greeting">Work log</h1>
          <p className="ts-muted">{admin ? "Everyone's time logs, and your own totals." : "What you worked on, and when."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!admin && <CopyYesterdayButton today={today} />}
          <div className="max-md:hidden">
            <AddLogButton today={today} />
          </div>
        </div>
      </header>

      <PeriodBar query={query} today={today} />

      <Suspense key={`summary-${key}`} fallback={<SummarySkeleton />}>
        <SummaryCards query={query} />
      </Suspense>

      <WorkLogFilters query={query} today={today} />

      <Suspense key={`list-${key}`} fallback={<ListSkeleton />}>
        <LogList query={query} />
      </Suspense>

      <AddLogButton today={today} floating />
    </div>
  );
}
