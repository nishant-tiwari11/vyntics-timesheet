import "../dashboard/dashboard.css";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { CompOffTile, ExpensesTile, LeaveTile, SalaryTile, TileSkeleton } from "./tiles";

export const metadata = { title: "My Overview" };
export const dynamic = "force-dynamic";

// One page with a tile for leave, comp-off, expenses and salary, each opening its full page. For employees and managers; an admin
// has no timesheet, leave, expenses or salary of their own.
export default async function OverviewPage() {
  if ((await getCurrentUser())?.role === "admin") redirect("/timesheet/admin");

  return (
    <div className="ts-page ts-dash ts-dash-soft">
      <header className="ts-dhead">
        <div>
          <h1 className="ts-greeting">My Overview</h1>
          <p className="ts-muted">Your leave, comp-off, expenses and salary in one place.</p>
        </div>
      </header>

      <div className="ts-bento">
        <Suspense fallback={<TileSkeleton />}>
          <LeaveTile />
        </Suspense>
        <Suspense fallback={<TileSkeleton />}>
          <CompOffTile />
        </Suspense>
        <Suspense fallback={<TileSkeleton />}>
          <ExpensesTile />
        </Suspense>
        <Suspense fallback={<TileSkeleton />}>
          <SalaryTile />
        </Suspense>
      </div>
    </div>
  );
}
