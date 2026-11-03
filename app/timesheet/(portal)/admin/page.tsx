import "../dashboard/dashboard.css"; // chips, buttons, skeleton, work-log list styles
import "../timesheet/timesheet-page.css"; // week navigation + sideways scroll wrapper
import "./admin.css";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { CardSkeleton } from "../dashboard/sections";
import { EmployeesTab, LogsTab, RequestsTab, TimesheetsTab } from "./tabs";

export const metadata = { title: "Admin" };

const TABS = [
  { id: "timesheets", label: "Timesheets" },
  { id: "requests", label: "Requests" },
  { id: "logs", label: "Work logs" },
  { id: "employees", label: "Employees" },
] as const;

type Params = { tab?: string; week?: string; filter?: string; date?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // middleware.ts already blocks non-admins; this is the server-side check on every load.
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  const raw = await searchParams;
  const p: Params = { tab: one(raw.tab), week: one(raw.week), filter: one(raw.filter), date: one(raw.date) };
  const tab = TABS.find((t) => t.id === p.tab)?.id ?? "timesheets";

  let counts: { timesheets: number; requests: number } | null = null;
  try {
    counts = await getAdminCounts();
  } catch {
    counts = null; // badges are optional
  }
  const badge = (id: string) => (id === "timesheets" ? counts?.timesheets : id === "requests" ? counts?.requests : 0) ?? 0;

  return (
    <div className="ts-sheet-page">
      <h1 className="ts-h1">Admin</h1>

      <nav aria-label="Admin sections" className="ts-admin-tabs">
        {TABS.map((t) => {
          const n = badge(t.id);
          return (
            <Link
              key={t.id}
              href={`/timesheet/admin?tab=${t.id}`}
              className="ts-admin-tab"
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
              {n > 0 && (
                <span className="ts-count">
                  {n}
                  <span className="ts-sr-only"> waiting for a decision</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Suspense key={JSON.stringify([tab, p.week, p.filter, p.date])} fallback={<CardSkeleton title="Loading" tall />}>
        {tab === "timesheets" && <TimesheetsTab adminId={me.id} weekParam={p.week} />}
        {tab === "requests" && <RequestsTab adminId={me.id} filterParam={p.filter} />}
        {tab === "logs" && <LogsTab dateParam={p.date} />}
        {tab === "employees" && <EmployeesTab adminId={me.id} />}
      </Suspense>
    </div>
  );
}
