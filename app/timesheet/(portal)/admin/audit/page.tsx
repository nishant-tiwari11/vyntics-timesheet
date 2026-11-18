import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ScrollText, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAuditLog } from "@/lib/admin/audit";
import { SOURCES, auditHref, parseAuditQuery, type AuditEvent, type AuditQuery } from "@/lib/admin/auditModel";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export const metadata = { title: "Audit log" };

const pill = (active: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors max-md:min-h-11 ${active ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`;
const field = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm max-md:h-11";

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.id, s.label]));

function Rows({ rows }: { rows: AuditEvent[] }) {
  return (
    <>
      {/* A table on a wide screen, a card for each event on a phone. */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Audit log</caption>
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              {["When", "Who", "What", "On", "Details"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((e) => (
              <tr key={e.key} className="align-top hover:bg-muted/30">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{when(e.at)}</td>
                <td className="px-4 py-2.5 font-medium break-all">{e.actor}</td>
                <td className="px-4 py-2.5">
                  {e.action}
                  <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[e.source]}</span>
                </td>
                <td className="px-4 py-2.5 break-words">{e.target || "–"}</td>
                <td className="px-4 py-2.5 break-words text-muted-foreground">{e.detail || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {rows.map((e) => (
          <li key={e.key} className="grid gap-0.5 rounded-xl border bg-card p-3 text-sm">
            <p className="font-medium">{e.action}</p>
            <p className="break-words">
              <span className="text-muted-foreground">By</span> {e.actor}
            </p>
            {e.target && (
              <p className="break-words">
                <span className="text-muted-foreground">On</span> {e.target}
              </p>
            )}
            {e.detail && <p className="break-words text-muted-foreground">{e.detail}</p>}
            <p className="text-xs text-muted-foreground">
              {when(e.at)} · {SOURCE_LABEL[e.source]}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

async function Body({ query }: { query: AuditQuery }) {
  let log;
  try {
    log = await loadAuditLog(query);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin audit log", e);
    return (
      <p className="ts-alert" role="alert">
        {e instanceof TimesheetError ? e.message : "Something went wrong. Please try again."}
      </p>
    );
  }
  const today = todayInOffice();
  const link = (page: number) => auditHref(query, { page }, today);

  if (log.total === 0) {
    return (
      <div className="grid justify-items-center gap-1.5 rounded-xl border border-dashed px-4 py-12 text-center">
        {query.q ? <SearchX className="size-8 text-muted-foreground" aria-hidden="true" /> : <ScrollText className="size-8 text-muted-foreground" aria-hidden="true" />}
        <p className="font-medium">{query.q ? "Nothing matches that search" : "No activity in these dates"}</p>
        <p className="text-sm text-muted-foreground">{query.q ? "Try a different word, or clear the search." : "Try a wider range of dates, or a different part of the portal."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground" role="status">
        {log.total} {log.total === 1 ? "event" : "events"}, newest first
        {log.capped ? ". Only the latest events of each kind are read, so the oldest in a long range may be missing. Choose fewer dates to see them." : ""}
      </p>
      <Rows rows={log.rows} />
      {log.pages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {log.page} of {log.pages}
          </p>
          <div className="flex gap-2">
            {log.page > 1 ? (
              <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
                <Link href={link(log.page - 1)} rel="prev">
                  Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="max-md:min-h-11" disabled>
                Previous
              </Button>
            )}
            {log.page < log.pages ? (
              <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
                <Link href={link(log.page + 1)} rel="next">
                  Next
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="max-md:min-h-11" disabled>
                Next
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border" aria-busy="true" role="status" aria-label="Audit log, loading">
      <Skeleton className="h-10 w-full rounded-none" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-none" />
      ))}
      <span className="sr-only">Loading the audit log…</span>
    </div>
  );
}

// Who changed what, and when, in one list, drawn from the portal's own records: people and access, approvals, documents,
// expenses and payroll. Admin only.
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  const today = todayInOffice();
  const query = parseAuditQuery(await searchParams, today);

  return (
    <>
      <div className="grid gap-1">
        <h1 className="ts-h1">Audit log</h1>
        <p className="ts-muted">Who changed what, and when.</p>
      </div>

      <nav aria-label="Part of the portal" className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Link key={s.id} href={auditHref(query, { source: s.id, page: 1 }, today)} aria-current={query.source === s.id ? "page" : undefined} className={pill(query.source === s.id)}>
            {s.label}
          </Link>
        ))}
      </nav>

      <form action="/timesheet/admin/audit" method="get" role="search" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] lg:items-end">
        <input type="hidden" name="source" value={query.source} />
        <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-1">
          Search
          <input type="search" name="q" defaultValue={query.q} maxLength={60} placeholder="A person, an action or a detail" className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          From
          <input type="date" name="from" defaultValue={query.from} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <input type="date" name="to" defaultValue={query.to} className={field} />
        </label>
        <Button type="submit" className="max-md:min-h-11">
          Apply
        </Button>
      </form>

      <Suspense key={JSON.stringify(query)} fallback={<BodySkeleton />}>
        <Body query={query} />
      </Suspense>
    </>
  );
}
