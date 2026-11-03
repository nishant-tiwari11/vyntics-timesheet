import "./dashboard.css";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatTodayLong, greeting, todayInOffice } from "@/lib/timesheet/dates";
import ApplyForm from "./ApplyForm";
import WorkLogForm from "./WorkLogForm";
import WorkLogList from "./WorkLogList";
import { CardSkeleton, MonthCard, RequestsCard, RequestsTable, WeekCard, WeekStrip } from "./sections";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const today = todayInOffice();

  return (
    <div className="ts-dash">
      <header className="ts-dash-head">
        <h1 className="ts-h1">
          {greeting()}, {user?.name}
        </h1>
        <p className="ts-muted">{formatTodayLong()}</p>
      </header>

      <div className="ts-summary">
        <Suspense fallback={<CardSkeleton title="This week" />}>
          <WeekCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton title="This month" />}>
          <MonthCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton title="Leave and WFH" />}>
          <RequestsCard />
        </Suspense>
      </div>

      <Suspense fallback={<CardSkeleton title="This week" tall />}>
        <WeekStrip />
      </Suspense>

      <div className="ts-split" id="worklog">
        <section className="ts-card" aria-labelledby="card-worklog-form">
          <h2 className="ts-h2" id="card-worklog-form">
            End-of-day work log
          </h2>
          <WorkLogForm />
        </section>
        <Suspense fallback={<CardSkeleton title="Your work log" tall />}>
          <WorkLogList />
        </Suspense>
      </div>

      <div className="ts-split" id="leave">
        <section className="ts-card" aria-labelledby="card-apply">
          <h2 className="ts-h2" id="card-apply">
            Apply for leave or WFH
          </h2>
          <ApplyForm today={today} />
        </section>
        <Suspense fallback={<CardSkeleton title="Your requests" tall />}>
          <RequestsTable />
        </Suspense>
      </div>
    </div>
  );
}
