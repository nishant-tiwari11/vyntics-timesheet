import "../dashboard/dashboard.css"; // chips, buttons, skeleton, work-log list styles
import "./admin.css";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { AdminTableSkeleton } from "../../_components/skeletons";
import { CompOffTab } from "./CompOffTab";
import { HolidaysTab } from "./HolidaysTab";
import { AccessTab, EmployeesTab, LogsTab, RequestsTab } from "./tabs";

export const metadata = { title: "Admin" };

const TABS = [
  { id: "requests", label: "Requests" },
  { id: "logs", label: "Work logs" },
  { id: "employees", label: "Employees" },
  { id: "holidays", label: "Holidays" },
  { id: "compoff", label: "Comp-off" },
  { id: "access", label: "Access" },
] as const;

type Params = { tab?: string; filter?: string; date?: string; year?: string; type?: string };

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
  const p: Params = { tab: one(raw.tab), filter: one(raw.filter), date: one(raw.date), year: one(raw.year), type: one(raw.type) };
  const tab = TABS.find((t) => t.id === p.tab)?.id ?? "requests";

  let counts: { requests: number; compOff: number } | null = null;
  try {
    counts = await getAdminCounts();
  } catch {
    counts = null; // badges are optional
  }
  const badge = (id: string) => (id === "requests" ? counts?.requests : id === "compoff" ? counts?.compOff : 0) ?? 0;

  return (
    <div className="ts-page">
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

      <Suspense key={JSON.stringify([tab, p.filter, p.date, p.year, p.type])} fallback={<AdminTableSkeleton />}>
        {tab === "requests" && <RequestsTab adminId={me.id} filterParam={p.filter} />}
        {tab === "logs" && <LogsTab dateParam={p.date} />}
        {tab === "employees" && <EmployeesTab adminId={me.id} />}
        {tab === "holidays" && <HolidaysTab yearParam={p.year} typeParam={p.type} />}
        {tab === "compoff" && <CompOffTab filterParam={p.filter} />}
        {tab === "access" && <AccessTab />}
      </Suspense>
    </div>
  );
}
