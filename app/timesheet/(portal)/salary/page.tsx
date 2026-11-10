import { Download } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMyPayslip, getMyStructure, listMyPayslips, logSelf, structureShared } from "@/lib/payroll/mine";
import { isMonthKey } from "@/lib/payroll/period";
import { listMyQueries, type QueryRow } from "@/lib/payroll/queries";
import type { PayslipDetail, PayslipListItem, StructureView } from "@/lib/payroll/slipTypes";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { Amount, HideToggle } from "./AmountMask";
import LazyNetPayChart from "./LazyNetPayChart";
import MonthPicker from "./MonthPicker";
import PrintButton from "./PrintButton";
import RaiseQuery from "./RaiseQuery";

export const metadata = { title: "My Salary" };
export const dynamic = "force-dynamic";

const monthName = (m: string) => formatYmd(`${m}-01`, { month: "long", year: "numeric" });
const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

const link = "inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:border-foreground hover:bg-accent";

function StatusBadge({ status }: { status: "finalized" | "paid" }) {
  return (
    <Badge variant="outline" className={status === "paid" ? "border-foreground bg-foreground text-background" : "border-foreground"}>
      {status === "paid" ? "✓✓ Paid" : "✓ Finalized"}
    </Badge>
  );
}

export default async function SalaryPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const raw = await searchParams;

  let slips: PayslipListItem[] = [];
  let queries: QueryRow[] = [];
  let shared = false;
  let error: string | null = null;
  try {
    [slips, queries, shared] = await Promise.all([listMyPayslips(), listMyQueries().catch(() => [] as QueryRow[]), structureShared().catch(() => false)]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("salary-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  if (error) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My Salary</h1>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
        <Link href="/timesheet/salary" className="w-fit text-sm underline underline-offset-4">
          Try again
        </Link>
      </div>
    );
  }

  const currency = slips[0]?.currency ?? "INR";
  const months = slips.map((s) => s.month);
  const selected = isMonthKey(raw.month) && months.includes(raw.month) ? raw.month : months[0];
  const tab = raw.tab === "structure" && shared ? "structure" : "payslips";

  let detail: PayslipDetail | null = null;
  let structure: StructureView | null = null;
  let detailError: string | null = null;
  try {
    if (tab === "payslips" && selected) detail = await getMyPayslip(selected);
    if (tab === "structure") structure = await getMyStructure(currency);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("salary-page", e);
    detailError = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }
  // Who looked, and when (your own views only).
  await logSelf(detail ? "viewed_payslip" : "viewed_my_salary", detail?.id ?? null);

  const latest = slips[0];
  const ytd = latest ? slips.filter((s) => s.month.slice(0, 4) === latest.month.slice(0, 4)).reduce((n, s) => n + s.gross, 0) : 0;
  const myQueries = queries.filter((q) => !detail || q.payslipId === detail.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Salary</h1>
          <p className="text-sm text-muted-foreground">Your payslips, read-only. Only finalized payslips appear here, and only yours.</p>
        </div>
        <HideToggle />
      </div>

      {slips.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No payslips yet</strong>
          <p>Your first payslip will appear after the payroll is finalized.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 no-print">
            <div className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">Net pay, {monthName(latest.month)}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                <Amount paise={latest.net} currency={currency} />
              </dd>
            </div>
            <div className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">Payable days</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{latest.payableDays}</dd>
            </div>
            <div className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">Loss of pay days</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{latest.lopDays}</dd>
            </div>
            <div className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">Earned so far in {latest.month.slice(0, 4)}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                <Amount paise={ytd} currency={currency} />
              </dd>
            </div>
          </dl>

          {/* Tabs */}
          <nav aria-label="My Salary sections" className="flex gap-1 border-b no-print">
            {[
              { id: "payslips", label: "Payslips", href: `/timesheet/salary${selected ? `?month=${selected}` : ""}` },
              ...(shared ? [{ id: "structure", label: "Salary structure", href: "/timesheet/salary?tab=structure" }] : []),
            ].map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors md:min-h-10",
                  tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {detailError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
              {detailError}{" "}
              <Link href="/timesheet/salary" className="underline underline-offset-4">
                Try again
              </Link>
            </div>
          )}

          {tab === "structure" ? (
            structure ? (
              <section aria-label="Salary structure" className="grid gap-4">
                <p className="text-sm text-muted-foreground">Your current monthly breakdown, effective from {day(structure.effectiveFrom)}. This is your fixed pay before any leave, overtime, bonus or deduction.</p>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Salary structure</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="text-right">Per month</TableHead>
                        <TableHead className="text-right">Per year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["Basic", structure.basic],
                        ["HRA", structure.hra],
                        ["Other allowances", structure.allowances],
                      ].map(([label, value]) => (
                        <TableRow key={label as string}>
                          <TableCell>{label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={value as number} currency={currency} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={(value as number) * 12} currency={currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-medium">Total (before deductions)</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          <Amount paise={structure.monthlyGross} currency={currency} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          <Amount paise={structure.annualGross} currency={currency} />
                        </TableCell>
                      </TableRow>
                      {structure.deductions > 0 && (
                        <TableRow>
                          <TableCell>Fixed deductions</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={structure.deductions} currency={currency} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={structure.deductions * 12} currency={currency} />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : (
              <div className="ts-card ts-empty">
                <strong>No salary structure to show</strong>
                <p>Your current structure isn&apos;t available yet. Ask payroll if you think it should be.</p>
              </div>
            )
          ) : (
            <>
              <MonthPicker months={months} current={selected} />

              {detail && (
                <article aria-label={`Payslip for ${monthName(detail.month)}`} className="grid gap-5 rounded-lg border p-5 print-area">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <h2 className="text-lg font-semibold">Payslip, {monthName(detail.month)}</h2>
                      <p className="text-sm text-muted-foreground">
                        {detail.employee.name}
                        {detail.employee.department ? ` · ${detail.employee.department}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Pay period {day(detail.periodStart)} to {day(detail.periodEnd)}
                      </p>
                    </div>
                    <div className="grid justify-items-end gap-1">
                      <StatusBadge status={detail.status} />
                      {detail.paidOn && <span className="text-xs text-muted-foreground">Paid on {day(detail.paidOn)}</span>}
                    </div>
                  </header>

                  <div className="grid gap-5 md:grid-cols-2">
                    {[
                      ["Earnings", detail.earnings],
                      ["Deductions", detail.deductionLines],
                    ].map(([title, lines]) => (
                      <section key={title as string} aria-label={title as string}>
                        <h3 className="mb-2 text-sm font-semibold">{title as string}</h3>
                        {(lines as typeof detail.earnings).length === 0 ? (
                          <p className="text-sm text-muted-foreground">None</p>
                        ) : (
                          <ul className="grid gap-1.5 text-sm">
                            {(lines as typeof detail.earnings).map((l, i) => (
                              <li key={`${l.code}-${i}`} className="flex justify-between gap-3 border-b border-dashed pb-1.5">
                                <span>{l.label}</span>
                                <Amount paise={l.amount} currency={currency} className="tabular-nums" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>

                  <div className="grid gap-1.5 border-t pt-4 text-sm">
                    <p className="flex justify-between gap-3">
                      <span>Gross pay</span>
                      <Amount paise={detail.gross} currency={currency} className="tabular-nums" />
                    </p>
                    <p className="flex justify-between gap-3">
                      <span>Total deductions</span>
                      <Amount paise={detail.deductions} currency={currency} className="tabular-nums" />
                    </p>
                    {detail.roundingAdjustment !== 0 && (
                      <p className="flex justify-between gap-3">
                        <span>Rounding</span>
                        <Amount paise={detail.roundingAdjustment} currency={currency} className="tabular-nums" />
                      </p>
                    )}
                    <p className="flex justify-between gap-3 text-base font-semibold">
                      <span>Net pay</span>
                      <Amount paise={detail.net} currency={currency} className="tabular-nums" />
                    </p>
                  </div>

                  <section aria-label="Attendance summary" className="grid gap-3 border-t pt-4">
                    <div>
                      <h3 className="text-sm font-semibold">Attendance summary</h3>
                      <p className="text-xs text-muted-foreground">How your payable days were worked out. Only approved timesheets, leave and comp-off are counted.</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      {[
                        ["Working days", detail.attendance.workingDays],
                        ["Present days", detail.attendance.presentDays],
                        ["Work from home", detail.attendance.wfhDays],
                        ["Paid leave", detail.attendance.paidLeaveDays],
                        ["Comp-off leave", detail.attendance.compOffLeaveDays],
                        ["Loss of pay", detail.attendance.lopDays],
                        ["Absent", detail.attendance.absentDays],
                        ["Holidays or week-offs worked", detail.attendance.holidayWorkedDays],
                        ["Comp-off earned", detail.attendance.compOffEarnedDays],
                        ["Payable days", detail.payableDays],
                      ].map(([label, value]) => (
                        <div key={label as string} className="flex justify-between gap-2 border-b border-dashed pb-1">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-medium tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <div className="flex flex-wrap gap-2 border-t pt-4 no-print">
                    <Button asChild>
                      <a href={`/timesheet/salary/pdf?month=${detail.month}`} aria-label={`Download the ${monthName(detail.month)} payslip as a PDF`}>
                        <Download aria-hidden="true" /> Download PDF
                      </a>
                    </Button>
                    <Button asChild variant="outline">
                      <a href={`/timesheet/salary/pdf?year=${detail.month.slice(0, 4)}`} aria-label={`Download all ${detail.month.slice(0, 4)} payslips as one PDF`}>
                        <Download aria-hidden="true" /> All of {detail.month.slice(0, 4)}
                      </a>
                    </Button>
                    <PrintButton />
                    <RaiseQuery payslipId={detail.id} monthLabel={monthName(detail.month)} />
                  </div>
                </article>
              )}

              {myQueries.length > 0 && (
                <section aria-label="My queries" className="grid gap-3 no-print">
                  <h2 className="text-base font-semibold">My queries{detail ? ` about ${monthName(detail.month)}` : ""}</h2>
                  <ul className="grid gap-3">
                    {myQueries.map((q) => (
                      <li key={q.id} className="grid gap-1 rounded-lg border p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{q.topic}</strong>
                          <Badge variant="outline" className={q.status === "open" ? "border-dashed" : ""}>
                            {q.status === "open" ? "○ Open" : "✓ Resolved"}
                          </Badge>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-muted-foreground">{q.message}</p>
                        {q.reply && (
                          <p className="whitespace-pre-wrap break-words border-l-2 pl-3">
                            <span className="text-muted-foreground">Payroll: </span>
                            {q.reply}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Net pay over time (loaded on its own) */}
              <section aria-label="Net pay over time" className="grid gap-3 no-print">
                <h2 className="text-base font-semibold">Net pay over time</h2>
                <LazyNetPayChart slips={slips} currency={currency} />
              </section>

              {/* Every month */}
              <section aria-label="All payslips" className="grid gap-3 no-print">
                <h2 className="text-base font-semibold">All payslips</h2>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Your payslips, newest first</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {slips.map((s) => (
                        <TableRow key={s.id} data-state={s.month === selected ? "selected" : undefined}>
                          <TableCell className="whitespace-nowrap font-medium">{monthName(s.month)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={s.gross} currency={currency} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Amount paise={s.deductions} currency={currency} />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            <Amount paise={s.net} currency={currency} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={s.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1.5">
                              <Link href={`/timesheet/salary?month=${s.month}`} className={link} aria-label={`View the ${monthName(s.month)} payslip`}>
                                View
                              </Link>
                              <a href={`/timesheet/salary/pdf?month=${s.month}`} className={link} aria-label={`Download the ${monthName(s.month)} payslip as a PDF`}>
                                <Download className="mr-1 size-4" aria-hidden="true" /> PDF
                              </a>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
