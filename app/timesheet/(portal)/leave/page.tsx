import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import "../dashboard/dashboard.css";
import { Suspense } from "react";
import { addDays, todayInOffice } from "@/lib/timesheet/dates";
import { myBalance } from "@/lib/timesheet/compOff";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { RequestsSkeleton } from "../../_components/skeletons";
import ApplyForm from "../dashboard/ApplyForm";
import { RequestsTable } from "../dashboard/sections";
import CompOffSection from "./CompOffSection";

export const metadata = { title: "Leave & WFH" };

// Everything here is per signed-in user, so it is never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // An admin decides requests (Admin > Leave & approvals); they do not apply here.
  if ((await getCurrentUser())?.role === "admin") redirect("/timesheet/admin?tab=requests");
  const raw = (await searchParams).type;
  const t = Array.isArray(raw) ? raw[0] : raw;
  const initialType = t === "wfh" || t === "comp" ? t : "leave";
  const today = todayInOffice();
  // Public holidays and festivals for the next two years. If they can't load, nothing is skipped.
  const [offDays, balance] = await Promise.all([
    offDatesBetween(today, addDays(today, 730)).catch(() => [] as string[]),
    myBalance().catch(() => null), // the form still works without it; Comp-off then explains it couldn't load
  ]);
  return (
    <div className="ts-page">
      <header>
        <h1 className="ts-greeting">Leave &amp; WFH</h1>
        <p className="ts-muted">Saturday and Sunday are company off days, so only working days are counted.</p>
      </header>

      <section className="ts-card" aria-labelledby="card-apply">
        <h2 className="ts-h2" id="card-apply">
          Apply for leave or WFH
        </h2>
        <ApplyForm today={today} offDays={offDays} compOff={balance} initialType={initialType} />
      </section>

      <Suspense fallback={<RequestsSkeleton />}>
        <RequestsTable />
      </Suspense>

      <Suspense fallback={<RequestsSkeleton title="Comp-off" rows={2} />}>
        <CompOffSection />
      </Suspense>
    </div>
  );
}
