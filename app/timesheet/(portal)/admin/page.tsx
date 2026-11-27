import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { AdminTableSkeleton } from "../../_components/skeletons";
import { AdminOverview, AdminOverviewSkeleton } from "./AdminOverview";
import { HolidaysTab } from "./HolidaysTab";
import { EmployeesTab } from "./tabs";

export const metadata = { title: "Admin" };

// /timesheet/admin is the overview. The older pages are still here under ?tab= (the Admin menu in layout.tsx links to them):
// Approvals = requests, logs and comp-off; Holidays & Leave Policy = holidays; Users & Roles = employees (and /admin/access).
const TABS = ["requests", "logs", "employees", "holidays", "compoff", "access", "documents"] as const;
type Params = { tab?: string; filter?: string; date?: string; year?: string; type?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HEADINGS: Record<string, string> = { holidays: "Holidays & Leave Policy", employees: "Employees" };

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
      <Suspense fallback={<AdminOverviewSkeleton />}>
        <AdminOverview name={me.name || me.email} employeeId={isUuid(one(raw.employee)) ? (one(raw.employee) as string) : null} raw={raw} />
      </Suspense>
    );
  }

  // Approvals moved to their own page; time logs are no longer approved (they are looked at on the Work logs page).
  if (tab === "requests") redirect("/timesheet/admin/approvals");
  if (tab === "compoff") redirect("/timesheet/admin/approvals?view=compoff");
  if (tab === "logs") redirect("/timesheet/worklog");

  // The old email list is replaced by the full Access page (roles, passwords, expiry, audit log).
  if (tab === "access") redirect("/timesheet/admin/access");
  if (tab === "documents") redirect("/timesheet/admin/documents");

  return (
    <>
      <h1 className="ts-h1">{HEADINGS[tab] ?? "Admin"}</h1>

      <Suspense key={JSON.stringify([tab, p.filter, p.date, p.year, p.type])} fallback={<AdminTableSkeleton />}>
        {tab === "employees" && <EmployeesTab adminId={me.id} />}
        {tab === "holidays" && <HolidaysTab yearParam={p.year} typeParam={p.type} />}
      </Suspense>
    </>
  );
}
