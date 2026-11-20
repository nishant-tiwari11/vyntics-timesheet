import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { payBreakdown } from "@/lib/payroll/breakdown";
import { listPayrollHistory, type HistoryRow, type PersonOption } from "@/lib/payroll/history";
import { formatMoney } from "@/lib/payroll/money";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import RunStatusBadge from "../RunStatusBadge";
import { PayTotal } from "../runs/[id]/RunControls";

export const metadata = { title: "Payroll · History" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthName = (key: string) => formatYmd(`${key}-01`, { month: "long", year: "numeric" });
const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

// Every payslip that has been finalized, for one employee or for everyone: base, bonus, expenses reimbursed and the final
// total, month by month. The payroll layout turns non-admins away; the data function checks again.
export default async function PayrollHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const e = Array.isArray(raw.employee) ? raw.employee[0] : raw.employee;
  const employee = e && UUID.test(e) ? e : null;

  let rows: HistoryRow[] = [];
  let people: PersonOption[] = [];
  let error: string | null = null;
  try {
    ({ rows, people } = await listPayrollHistory(employee));
  } catch (err) {
    if (!(err instanceof TimesheetError)) logError("payroll-history-page", err);
    error = err instanceof TimesheetError ? err.message : "Something went wrong. Please try again.";
  }

  const currency = rows[0]?.currency ?? "INR";
  const totals = rows.reduce(
    (t, r) => {
      const b = payBreakdown(r.payslip);
      return { base: t.base + b.base, bonus: t.bonus + b.bonus, expenses: t.expenses + b.expenses, total: t.total + b.total };
    },
    { base: 0, bonus: 0, expenses: 0, total: 0 },
  );
  const selected = people.find((p) => p.id === employee);

  return (
    <section className="grid gap-5" aria-label="Payroll history">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Payroll history</h2>
          <p className="text-sm text-muted-foreground">What was paid, month by month: base salary, bonus, expenses reimbursed and the final total. Figures are the stored payslips.</p>
        </div>
        <form method="get" className="flex flex-wrap gap-2" role="search" aria-label="Choose an employee">
          <label htmlFor="history-employee" className="sr-only">
            Employee
          </label>
          <select id="history-employee" name="employee" defaultValue={employee ?? ""} className="h-9 rounded-md border border-input bg-background px-3 text-sm max-md:min-h-11">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent max-md:min-h-11">
            Show
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No payroll history yet</strong>
          <p>{selected ? `${selected.name} has no finalized payslips.` : "Payslips appear here once a payroll run is finalized."}</p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Base salary paid", totals.base],
              ["Bonuses", totals.bonus],
              ["Expenses reimbursed", totals.expenses],
              ["Total paid", totals.total],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatMoney(value as number, currency)}</dd>
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Payslips, newest first</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {!employee && <TableHead>Employee</TableHead>}
                  <TableHead className="text-right">Base salary</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Final total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Breakdown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const b = payBreakdown(r.payslip);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link href={`/timesheet/payroll/runs/${r.runId}`} className="underline-offset-4 hover:underline">
                          {monthName(r.month)}
                        </Link>
                      </TableCell>
                      {!employee && (
                        <TableCell className="min-w-36">
                          <Link href={`/timesheet/payroll/history?employee=${r.userId}`} className="font-medium underline-offset-4 hover:underline">
                            {r.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{r.department || "No department"}</div>
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{formatMoney(b.base, r.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.bonus > 0 ? formatMoney(b.bonus, r.currency) : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.expenses > 0 ? formatMoney(b.expenses, r.currency) : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(b.deductions, r.currency)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(b.total, r.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <RunStatusBadge status={r.status} />
                        {r.paidOn && <div className="mt-1 text-xs text-muted-foreground">{day(r.paidOn)}</div>}
                      </TableCell>
                      <TableCell className="min-w-56">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show</summary>
                          <div className="mt-2">
                            <PayTotal p={r.payslip} currency={r.currency} />
                            {r.payslip.expenses.length > 0 && (
                              <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                                {r.payslip.expenses.map((x) => (
                                  <li key={x.claimId}>
                                    {x.claimCode} · {x.category}: {formatMoney(x.amount, r.currency)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </details>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
