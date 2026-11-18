import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadReport, loadReportPeople, type Person } from "@/lib/admin/reports";
import { GROUPS, PRESETS, REPORTS, parseReportQuery, presetRange, rangeLabel, reportHref, type ReportQuery, type ReportTable } from "@/lib/admin/reportsModel";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { allProjectNames } from "@/lib/timesheet/projectList";

export const metadata = { title: "Reports" };

const pill = (active: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors max-md:min-h-11 ${active ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`;
const field = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm max-md:h-11";

function Table({ table }: { table: ReportTable }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{table.title}</caption>
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {table.columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2.5 font-medium whitespace-nowrap ${c.numeric ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {table.rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              {table.columns.map((c, j) => (
                <td key={c.key} className={`px-4 py-2.5 ${c.numeric ? "text-right tabular-nums" : ""} ${j === 0 ? "font-medium" : ""}`}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {table.totals && (
          <tfoot>
            <tr className="border-t-2 bg-muted/40 font-semibold">
              {table.columns.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                  {table.totals?.[c.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

async function Body({ query }: { query: ReportQuery }) {
  let result;
  try {
    result = await loadReport(query);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin report", e);
    return (
      <p className="ts-alert" role="alert">
        {e instanceof TimesheetError ? e.message : "Something went wrong. Please try again."}
      </p>
    );
  }
  const { table, truncated } = result;
  const today = todayInOffice();
  const nothing = table.rows.length === 0;
  const csv = reportHref(query, {}, today, "/timesheet/admin/reports/export") + (reportHref(query, {}, today).includes("?") ? "&" : "?") + "format=csv";
  const xlsx = reportHref(query, {}, today, "/timesheet/admin/reports/export");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {table.title} <span className="font-normal text-muted-foreground">· {rangeLabel(query.from, query.to)}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
            <a href={xlsx}>
              <FileSpreadsheet aria-hidden="true" /> Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
            <a href={csv}>
              <Download aria-hidden="true" /> CSV
            </a>
          </Button>
        </div>
      </div>

      {truncated && (
        <p role="note" className="rounded-md border border-dashed px-3 py-2 text-sm">
          This range has more than 20,000 entries, so the numbers cover only the first part. Choose a shorter range.
        </p>
      )}

      {nothing ? (
        <div className="grid justify-items-center gap-1.5 rounded-xl border border-dashed px-4 py-12 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{query.report === "under" ? "Nobody is under target" : "Nothing to show"}</p>
          <p className="text-sm text-muted-foreground">
            {query.report === "under" ? "Everyone has logged at least the target for the working days so far." : "There is no data for these dates and filters. Try a wider range."}
          </p>
        </div>
      ) : (
        <Table table={table} />
      )}
      {table.note && <p className="text-xs text-muted-foreground">{table.note}</p>}
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" role="status" aria-label="Report, loading">
      <Skeleton className="h-7 w-72" />
      <div className="grid gap-px overflow-hidden rounded-xl border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
      <span className="sr-only">Loading the report…</span>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  const today = todayInOffice();
  const query = parseReportQuery(await searchParams, today);
  let people: Person[] = [];
  const projects = await allProjectNames();
  try {
    people = await loadReportPeople();
  } catch (e) {
    logError("admin report people", e);
  }
  const href = (change: Partial<ReportQuery>) => reportHref(query, change, today);

  return (
    <>
      <div className="grid gap-1">
        <h1 className="ts-h1">Reports</h1>
        <p className="ts-muted">Hours, targets and leave, for any dates. Export what you see to Excel or CSV.</p>
      </div>

      <nav aria-label="Report" className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Link key={r.id} href={href({ report: r.id })} aria-current={query.report === r.id ? "page" : undefined} className={pill(query.report === r.id)}>
            {r.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Filters" className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick dates">
          {PRESETS.map((p) => {
            const range = presetRange(p.id, today);
            return (
              <Link key={p.id} href={href(range)} className={pill(query.from === range.from && query.to === range.to)}>
                {p.label}
              </Link>
            );
          })}
        </div>

        <form action="/timesheet/admin/reports" method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <input type="hidden" name="report" value={query.report} />
          <input type="hidden" name="group" value={query.group} />
          <label className="grid gap-1 text-sm">
            From
            <input type="date" name="from" defaultValue={query.from} max={today > query.to ? today : query.to} className={field} />
          </label>
          <label className="grid gap-1 text-sm">
            To
            <input type="date" name="to" defaultValue={query.to} className={field} />
          </label>
          <label className="grid gap-1 text-sm">
            Employee
            <select name="employee" defaultValue={query.employee} className={field}>
              <option value="all">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {query.report === "hours" ? (
            <label className="grid gap-1 text-sm">
              Project
              <select name="project" defaultValue={query.project} className={field}>
                <option value="all">All projects</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="hidden lg:block" />
          )}
          <Button type="submit" className="max-md:min-h-11">
            Apply
          </Button>
        </form>

        {query.report === "hours" && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Group by">
            {GROUPS.map((g) => (
              <Link key={g.id} href={href({ group: g.id })} aria-current={query.group === g.id ? "true" : undefined} className={pill(query.group === g.id)}>
                {g.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      <Suspense key={JSON.stringify(query)} fallback={<BodySkeleton />}>
        <Body query={query} />
      </Suspense>
    </>
  );
}
