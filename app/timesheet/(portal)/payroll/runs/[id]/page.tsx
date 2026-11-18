import Link from "next/link";
import { notFound } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/payroll/money";
import { getRunDetail, type RunDetail } from "@/lib/payroll/runs";
import { formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import RunStatusBadge from "../../RunStatusBadge";
import { EmployeeDetails, RunActions } from "./RunControls";

export const metadata = { title: "Payroll · Run" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail: RunDetail | null = null;
  let error: string | null = null;
  let missing = false;
  try {
    detail = await getRunDetail(id);
  } catch (e) {
    if (e instanceof TimesheetError && /doesn't exist|valid/i.test(e.message)) missing = true;
    else {
      if (!(e instanceof TimesheetError)) logError("payroll-run", e);
      error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
    }
  }
  if (missing) notFound();

  if (error || !detail) {
    return (
      <div className="grid gap-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error ?? "Couldn't load the payroll run."}
        </div>
        <Link href={`/timesheet/payroll/runs/${id}`} className="w-fit text-sm underline underline-offset-4">
          Try again
        </Link>
      </div>
    );
  }

  const { run, rows, runWarnings, locked, currency } = detail;
  const totals = rows.reduce(
    (t, r) => ({
      employees: t.employees + 1,
      gross: t.gross + r.payslip.gross,
      deductions: t.deductions + r.payslip.totalDeductions,
      reimbursement: t.reimbursement + r.payslip.expenses.reduce((n, e) => n + e.amount, 0),
      claims: t.claims + r.payslip.expenses.length,
      net: t.net + r.payslip.net,
    }),
    { employees: 0, gross: 0, deductions: 0, reimbursement: 0, claims: 0, net: 0 },
  );
  const withExpenses = rows.filter((r) => r.payslip.expenses.length > 0);
  const title = formatYmd(`${run.month}-01`, { month: "long", year: "numeric" });

  return (
    <section className="grid gap-5" aria-label={`Payroll run for ${title}`}>
      <div className="grid gap-1">
        <Link href="/timesheet/payroll/runs" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← All runs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <RunStatusBadge status={run.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {day(run.periodStart)} to {day(run.periodEnd)}
          {run.paidOn ? ` · Paid on ${day(run.paidOn)}` : ""}
          {run.reopenCount > 0 ? ` · Reopened ${run.reopenCount} ${run.reopenCount === 1 ? "time" : "times"}` : ""}
        </p>
      </div>

      <RunActions runId={run.id} status={run.status} currency={currency} totals={{ employees: totals.employees, gross: totals.gross, net: totals.net, reimbursement: totals.reimbursement, claims: totals.claims }} warnings={runWarnings} today={todayInOffice()} />

      {locked ? (
        <p role="note" className="rounded-lg border border-dashed p-3 text-sm">
          This run is locked. The figures below are the stored payslips, exactly as they were finalized. To change anything, reopen the run with a reason.
        </p>
      ) : (
        runWarnings.length > 0 && (
          <ul role="status" className="list-disc space-y-1 rounded-lg border border-dashed p-3 pl-7 text-sm">
            {runWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Employees", String(totals.employees)],
          ["Gross", formatMoney(totals.gross, currency)],
          ["Deductions", formatMoney(totals.deductions, currency)],
          ["Expenses", formatMoney(totals.reimbursement, currency)],
          ["Net pay", formatMoney(totals.net, currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No employees in this run</strong>
          <p>Nobody was employed during this month. Check the joining dates under Salary structures.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Pay for each employee in this run</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Payable days</TableHead>
                <TableHead className="text-right">LOP / absent</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="min-w-44">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.department || "No department"}</div>
                    {(r.payslip.warnings.length > 0 || r.pending.length > 0) && !locked && (
                      <div className="mt-1 text-xs">
                        ○ {r.payslip.warnings.length + (r.pending.length > 0 ? 1 : 0)} {r.payslip.warnings.length + (r.pending.length > 0 ? 1 : 0) === 1 ? "warning" : "warnings"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.payslip.payableDays} / {r.payslip.baseDays}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.payslip.lopDays} / {r.payslip.absentDays}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.payslip.gross, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.payslip.totalDeductions, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.payslip.expenses.length === 0 ? (
                      "-"
                    ) : (
                      <>
                        {formatMoney(r.payslip.expenses.reduce((n, e) => n + e.amount, 0), currency)}
                        <Link href={`/timesheet/payroll/expenses?run=${run.id}&q=${encodeURIComponent(r.email)}`} className="block text-xs underline underline-offset-4">
                          {r.payslip.expenses.length} {r.payslip.expenses.length === 1 ? "claim" : "claims"}
                        </Link>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.payslip.net, currency)}</TableCell>
                  <TableCell className="text-right">
                    <EmployeeDetails runId={run.id} row={r} currency={currency} locked={locked} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {withExpenses.length > 0 && (
        <section aria-label="Expense reimbursements in this run" className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">Expense reimbursements</h3>
              <p className="text-sm text-muted-foreground">
                {locked
                  ? "Paid out in this run. These claims are Reimbursed and locked."
                  : "A preview of what is added to net pay. When you finalize, these claims become Reimbursed with this month and are locked."}
              </p>
            </div>
            <Link href={`/timesheet/payroll/expenses?run=${run.id}`} className="text-sm underline underline-offset-4">
              Open expense details
            </Link>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Expense claims paid with this payroll run</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withExpenses.flatMap((r) =>
                  r.payslip.expenses.map((e) => (
                    <TableRow key={e.claimId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.claimCode}</TableCell>
                      <TableCell className="whitespace-nowrap">{day(e.date)}</TableCell>
                      <TableCell>
                        {e.category}
                        {e.taxable ? " (taxable)" : ""}
                      </TableCell>
                      <TableCell className="max-w-64 break-words whitespace-normal">{e.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(e.amount, currency)}</TableCell>
                    </TableRow>
                  )),
                )}
                <TableRow>
                  <TableCell colSpan={5} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(totals.reimbursement, currency)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </section>
  );
}
