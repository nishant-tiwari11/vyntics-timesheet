import "./dashboard.css";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatTodayLong, greeting, todayInOffice } from "@/lib/timesheet/dates";
import { AddLogButton } from "./LogDialog";
import { CompSkeleton, Head, HeadSkeleton, TopTiles, TopTilesSkeleton, WeekSkeleton } from "./Bento";
import TimeLogs from "./TimeLogs";
import CompOffCard from "./CompOffCard";
import WeekAhead from "./WeekAhead";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, RANGES, STATUS_FILTERS, type LogQuery } from "./logQuery";
import { SnapshotSkeleton, StatsSkeleton, TimeLogsSkeleton } from "../../_components/skeletons";
import { CardSkeleton, SnapshotRow, StatCards } from "./sections";

export const metadata = { title: "Dashboard" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, raw] = await Promise.all([getCurrentUser(), searchParams]);
  const today = todayInOffice();
  const isAdmin = user?.role === "admin";

  // Anything unexpected in the address falls back to the defaults.
  const pageNumber = Number(one(raw.page));
  const sizeNumber = Number(one(raw.size));
  const query: LogQuery = {
    base: "/timesheet/dashboard",
    range: RANGES.find((r) => r.id === one(raw.range))?.id ?? "week",
    status: STATUS_FILTERS.find((s) => s.id === one(raw.status))?.id ?? "all",
    size: PAGE_SIZES.find((n) => n === sizeNumber) ?? DEFAULT_PAGE_SIZE,
    page: Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 10000 ? pageNumber : 1,
    q: (one(raw.q) ?? "").trim().slice(0, 60),
  };

  return (
    <div className="ts-page ts-dash">
      {/* Admins keep the plain dashboard. The tile layout is for everyone else. */}
      {isAdmin ? (
        <>
          <header className="ts-dash-head">
            <div>
              <h1 className="ts-greeting">
                {greeting()}, {user?.name}
              </h1>
              <p className="ts-muted">{formatTodayLong()}</p>
            </div>
            <AddLogButton today={today} />
          </header>

          <Suspense fallback={<StatsSkeleton />}>
            <StatCards />
          </Suspense>
        </>
      ) : (
        user && (
          <Suspense fallback={<HeadSkeleton />}>
            <Head user={user} today={today} />
          </Suspense>
        )
      )}

      {isAdmin && (
        <section className="ts-section" aria-labelledby="snap-title">
          <div className="ts-section-head">
            <h2 className="ts-h2s" id="snap-title">
              Today&apos;s snapshot <span className="ts-muted ts-section-date">{formatTodayLong()}</span>
            </h2>
            <Link href="/timesheet/worklog" className="ts-link">
              View all work logs
            </Link>
          </div>
          <Suspense fallback={<SnapshotSkeleton />}>
            <SnapshotRow />
          </Suspense>
        </section>
      )}

      {isAdmin ? (
        <>
          <Suspense fallback={<CardSkeleton title="This week" tall />}>
            <WeekAhead today={today} isAdmin legacy />
          </Suspense>

          <Suspense fallback={<CardSkeleton title="Comp-off" tall />}>
            <CompOffCard legacy />
          </Suspense>
        </>
      ) : (
        /* The tiles share one grid: you, your hours, today, then the week, what is coming up, and comp-off. */
        <div className="ts-bento">
          {user && (
            <Suspense fallback={<TopTilesSkeleton />}>
              <TopTiles user={user} today={today} />
            </Suspense>
          )}

          <Suspense fallback={<WeekSkeleton />}>
            <WeekAhead today={today} isAdmin={false} />
          </Suspense>

          <Suspense fallback={<CompSkeleton />}>
            <CompOffCard />
          </Suspense>
        </div>
      )}

      <Suspense key={JSON.stringify(query)} fallback={<TimeLogsSkeleton />}>
        <TimeLogs isAdmin={isAdmin} myId={user?.id ?? ""} query={query} />
      </Suspense>
    </div>
  );
}
