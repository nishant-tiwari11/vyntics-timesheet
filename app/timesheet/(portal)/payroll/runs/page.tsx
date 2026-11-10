import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/payroll/money";
import { monthContaining } from "@/lib/payroll/period";
import { listRuns, type RunSummary } from "@/lib/payroll/runs";
import { audit, getPayrollSettings } from "@/lib/payroll/server";
import { formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import RunStatusBadge from "../RunStatusBadge";
import { NewRunButton } from "./RunsControls";

export const metadata = { title: "Payroll · Runs" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short" });
const monthName = (key: string) => formatYmd(`${key}-01`, { month: "long", year: "numeric" });

export default async function RunsPage() {
  let runs: RunSummary[] = [];
  let currency = "INR";
  let suggested = todayInOffice().slice(0, 7);
  let error: string | null = null;
  try {
    const [list, settings] = await Promise.all([listRuns(), getPayrollSettings()]);
    runs = list;
    currency = settings.currency;
    suggested = monthContaining(todayInOffice(), settings.cycleStartDay);
    await audit("viewed", "payroll_runs", undefined, "Opened the payroll runs list");
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("payroll-runs-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  }

  return (
    <section className="grid gap-4" aria-label="Payroll runs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          One run per pay month. Preview everyone&apos;s pay, adjust it, review it and finalize it. Finalizing stores each payslip, so later changes never alter it.
        </p>
        <NewRunButton suggested={suggested} />
      </div>

      {runs.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No payroll runs yet</strong>
          <p>Create the first run for a month to preview everyone&apos;s pay.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Payroll runs, newest first</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Payslips</TableHead>
                <TableHead className="text-right">Net total</TableHead>
                <TableHead>
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{monthName(r.month)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {day(r.periodStart)} – {day(r.periodEnd)}
                  </TableCell>
                  <TableCell>
                    <RunStatusBadge status={r.status} />
                    {r.paidOn && <div className="mt-1 text-xs text-muted-foreground">Paid {formatYmd(r.paidOn, { day: "numeric", month: "short" })}</div>}
                    {r.reopenCount > 0 && <div className="mt-1 text-xs text-muted-foreground">Reopened {r.reopenCount}×</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.employees ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.netTotal != null ? formatMoney(r.netTotal, currency) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/timesheet/payroll/runs/${r.id}`} className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:border-foreground hover:bg-accent">
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
