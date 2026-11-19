import "./dashboard.css";
import Link from "next/link";
import { Home, Palmtree, Receipt } from "lucide-react";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatTodayLong, greeting, todayInOffice } from "@/lib/timesheet/dates";
import { AddLogButton } from "./LogDialog";
import TimeLogs from "./TimeLogs";
import CompOffCard from "./CompOffCard";
import UpcomingHolidays from "./UpcomingHolidays";
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
      <header className="ts-dash-head">
        <div>
          <h1 className="ts-greeting">
            {greeting()}, {user?.name}
          </h1>
          <p className="ts-muted">{formatTodayLong()}</p>
        </div>
      </header>

      <nav className="ts-quick" aria-label="Quick actions">
        <AddLogButton today={today} />
        <Link href="/timesheet/leave?type=leave" className="ts-quick-link">
          <Palmtree aria-hidden="true" /> Apply leave
        </Link>
        <Link href="/timesheet/leave?type=wfh" className="ts-quick-link">
          <Home aria-hidden="true" /> Request WFH
        </Link>
        <Link href="/timesheet/expenses" className="ts-quick-link">
          <Receipt aria-hidden="true" /> Add expense
        </Link>
      </nav>

      <Suspense fallback={<StatsSkeleton />}>
        <StatCards />
      </Suspense>

      {isAdmin && (
        <section className="ts-section" aria-labelledby="snap-title">
          <div className="ts-section-head">
            <h2 className="ts-h2s" id="snap-title">
              Today&apos;s snapshot <span className="ts-muted ts-section-date">{formatTodayLong()}</span>
            </h2>
            <Link href="/timesheet/admin?tab=logs" className="ts-link">
              View all work logs
            </Link>
          </div>
          <Suspense fallback={<SnapshotSkeleton />}>
            <SnapshotRow />
          </Suspense>
        </section>
      )}

      <Suspense fallback={<CardSkeleton title="This week" tall />}>
        <WeekAhead today={today} />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<CardSkeleton title="Upcoming holidays" tall />}>
          <UpcomingHolidays isAdmin={isAdmin} />
        </Suspense>
        <Suspense fallback={<CardSkeleton title="Comp-off" tall />}>
          <CompOffCard />
        </Suspense>
      </div>

      <Suspense key={JSON.stringify(query)} fallback={<TimeLogsSkeleton />}>
        <TimeLogs isAdmin={isAdmin} myId={user?.id ?? ""} query={query} />
      </Suspense>
    </div>
  );
}
