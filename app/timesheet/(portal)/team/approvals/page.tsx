import "../../dashboard/dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { loadPendingRequests } from "@/lib/timesheet/approvals";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { CompOffTab } from "../../admin/CompOffTab";
import { RequestCard } from "../../admin/approvals/RequestCard";

export const metadata = { title: "Team approvals" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "requests", label: "Leave & WFH" },
  { id: "compoff", label: "Comp-off credits" },
] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// A manager decides leave, work from home and comp-off for the people who report to them. The database only lets them see and
// decide those people's requests, so this page can't reach anyone else. Admins use Admin > Approvals instead.
export default async function TeamApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role === "admin") redirect("/timesheet/admin/approvals");
  if (me?.role !== "manager") redirect("/timesheet/dashboard");
  const raw = await searchParams;
  const view = VIEWS.find((v) => v.id === one(raw.view))?.id ?? "requests";

  let rows: Awaited<ReturnType<typeof loadPendingRequests>>["rows"] = [];
  let error: string | null = null;
  if (view === "requests") {
    try {
      rows = (await loadPendingRequests()).rows;
    } catch (e) {
      if (!(e instanceof TimesheetError)) logError("team approvals", e);
      error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team approvals</h1>
        <p className="text-sm text-muted-foreground">Leave, work from home and comp-off from the people who report to you.</p>
      </div>

      <nav aria-label="Approval sections" className="flex gap-1 overflow-x-auto border-b">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "requests" ? "/timesheet/team/approvals" : `/timesheet/team/approvals?view=${v.id}`}
            aria-current={view === v.id ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors md:min-h-10",
              view === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "requests" &&
        (error ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <div className="ts-card ts-empty">
            <strong>Nothing waiting</strong>
            <p>New leave and work-from-home requests from your team will show up here.</p>
          </div>
        ) : (
          <ul className="grid gap-4" aria-label="Requests waiting for a decision">
            {rows.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </ul>
        ))}

      {view === "compoff" && <CompOffTab filterParam={one(raw.filter)} base="/timesheet/team/approvals?view=compoff" canEditRules={false} />}
    </div>
  );
}
