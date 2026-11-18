import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { AdminTableSkeleton } from "../../_components/skeletons";
import { AdminOverview, AdminOverviewSkeleton, overviewHeading } from "./AdminOverview";
import { CompOffTab } from "./CompOffTab";
import { HolidaysTab } from "./HolidaysTab";
import { EmployeesTab, LogsTab, RequestsTab } from "./tabs";

export const metadata = { title: "Admin" };

// /timesheet/admin is the overview. The older pages are still here under ?tab= (the Admin menu in layout.tsx links to them):
// Approvals = requests, logs and comp-off; Holidays & Leave Policy = holidays; Users & Roles = employees (and /admin/access).
const TABS = ["requests", "logs", "employees", "holidays", "compoff", "access", "documents"] as const;
const APPROVALS = [
  { id: "requests", label: "Requests" },
  { id: "logs", label: "Work logs" },
  { id: "compoff", label: "Comp-off" },
] as const;

type Params = { tab?: string; filter?: string; date?: string; year?: string; type?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HEADINGS: Record<string, string> = { requests: "Approvals", logs: "Approvals", compoff: "Approvals", holidays: "Holidays & Leave Policy", employees: "Employees" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // proxy.ts and the layout already block non-admins; this is the check on every load of this page.
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  const raw = await searchParams;
  const p: Params = { tab: one(raw.tab), filter: one(raw.filter), date: one(raw.date), year: one(raw.year), type: one(raw.type) };
  const tab = TABS.find((t) => t === p.tab);

  // No tab: the overview.
  if (!tab) {
    return (
      <>
        {overviewHeading}
        <Suspense fallback={<AdminOverviewSkeleton />}>
          <AdminOverview />
        </Suspense>
      </>
    );
  }

  // The old email list is replaced by the full Access page (roles, passwords, expiry, audit log).
  if (tab === "access") redirect("/timesheet/admin/access");
  if (tab === "documents") redirect("/timesheet/admin/documents");

  const inApprovals = tab === "requests" || tab === "logs" || tab === "compoff";
  let counts: { requests: number; compOff: number } | null = null;
  if (inApprovals) {
    try {
      counts = await getAdminCounts();
    } catch {
      counts = null; // badges are optional
    }
  }
  const badge = (id: string) => (id === "requests" ? counts?.requests : id === "compoff" ? counts?.compOff : 0) ?? 0;

  return (
    <>
      <h1 className="ts-h1">{HEADINGS[tab] ?? "Admin"}</h1>

      {inApprovals && (
        <nav aria-label="Approvals" className="flex flex-wrap gap-2">
          {APPROVALS.map((t) => {
            const n = badge(t.id);
            const current = tab === t.id;
            return (
              <Link
                key={t.id}
                href={`/timesheet/admin?tab=${t.id}`}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors max-md:min-h-11 ${
                  current ? "border-foreground bg-foreground text-background" : "hover:border-foreground"
                }`}
              >
                {t.label}
                {n > 0 && (
                  <span className={`rounded-full px-1.5 text-xs ${current ? "bg-background text-foreground" : "bg-foreground text-background"}`}>
                    {n}
                    <span className="ts-sr-only"> waiting for a decision</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      <Suspense key={JSON.stringify([tab, p.filter, p.date, p.year, p.type])} fallback={<AdminTableSkeleton />}>
        {tab === "requests" && <RequestsTab adminId={me.id} filterParam={p.filter} />}
        {tab === "logs" && <LogsTab dateParam={p.date} />}
        {tab === "employees" && <EmployeesTab adminId={me.id} />}
        {tab === "holidays" && <HolidaysTab yearParam={p.year} typeParam={p.type} />}
        {tab === "compoff" && <CompOffTab filterParam={p.filter} />}
      </Suspense>
    </>
  );
}
