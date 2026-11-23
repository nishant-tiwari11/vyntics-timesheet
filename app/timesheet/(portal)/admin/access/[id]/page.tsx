import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/access/config";
import { loadEmployee, type EmployeeView } from "@/lib/admin/employee";
import { STATUS_LABEL } from "@/lib/expenses/types";
import { payBreakdown } from "@/lib/payroll/breakdown";
import { formatMoney } from "@/lib/payroll/money";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatRange, formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { UserAvatar } from "../../../../_components/UserAvatar";
import { nameFromEmail } from "@/lib/nameFromEmail";
import { EditName } from "./EditName";
import ExpenseStatusBadge from "../../../expenses/StatusBadge";
import RunStatusBadge from "../../../payroll/RunStatusBadge";

export const metadata = { title: "Employee" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never");
const card = "rounded-xl border bg-card p-4";

function Card({ title, href, action, children }: { title: string; href?: string; action?: string; children: React.ReactNode }) {
  return (
    <section className={card} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {action ?? "Open"}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const Unavailable = ({ what }: { what: string }) => <p className="text-sm text-muted-foreground">Couldn&apos;t load {what}. Refresh to try again.</p>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

// One person, for the owner / HR: who they are and what they logged, took, claimed and were paid. Admins only (the admin layout
// and proxy check, this page checks again, and so does every query behind it).
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const { id } = await params;

  let v: EmployeeView | null = null;
  let error: string | null = null;
  let missing = false;
  try {
    v = await loadEmployee(id);
  } catch (e) {
    if (e instanceof TimesheetError && /doesn't exist|valid/i.test(e.message)) missing = true;
    else {
      if (!(e instanceof TimesheetError)) logError("employee-page", e);
      error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
    }
  }
  if (missing) notFound();

  const back = (
    <Link href="/timesheet/admin/access" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
      ← Employees
    </Link>
  );
  if (error || !v) {
    return (
      <div className="ts-page grid gap-3">
        {back}
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error ?? "Couldn't load this employee."}
        </div>
      </div>
    );
  }

  const { person, expenses, payslips, salary, leave, logs, monthHours } = v;
  const name = person.name || person.email;
  const expired = person.expiresOn !== null && person.expiresOn < v.today;
  const claimTotal = (statuses: string[]) => (expenses ?? []).filter((c) => statuses.includes(c.status)).reduce((n, c) => n + (c.status === "pending" ? c.claimed : (c.approved ?? 0)), 0);

  return (
    <div className="ts-page grid gap-5">
      {back}

      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar userId={person.userId} name={name} className="size-16 text-xl" />
          <div className="min-w-0">
            <h1 className="ts-h1 break-words">{name}</h1>
            <p className="text-sm break-all text-muted-foreground">{person.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">{ROLE_LABEL[person.role]}</Badge>
              <Badge variant="outline" className={person.status === "disabled" ? "border-dashed" : expired ? "border-destructive text-destructive" : "border-foreground"}>
                {person.status === "disabled" ? "○ Disabled" : expired ? "✕ Access expired" : "✓ Active"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!nameFromEmail(person.email) && <EditName userId={person.userId} name={person.name} />}
          <Link href={`/timesheet/profile?user=${person.userId}`} className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent max-md:min-h-11">
            Full profile and documents
          </Link>
          <Link href="/timesheet/admin/access" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent max-md:min-h-11">
            Change role or access
          </Link>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Joined" value={v.joinedOn ? day(v.joinedOn) : "Not set"} />
        <Stat label="Manager" value={person.managerEmail || "None"} />
        <Stat label="Signs in with" value={person.loginMethod === "password" ? "Email and password" : "Google"} />
        <Stat label="Last sign-in" value={person.signedIn ? when(person.lastLogin) : "Not yet"} />
        <Stat label="Access ends" value={person.expiresOn ? day(person.expiresOn) : "No end date"} />
      </dl>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card title="Work this month" href="/timesheet/worklog" action="All work logs">
          {!logs || !monthHours ? (
            <Unavailable what="work logs" />
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="text-2xl font-semibold tabular-nums text-foreground">{monthHours.approved}</span> h approved
                {monthHours.pending > 0 ? ` · ${monthHours.pending} h waiting for approval` : ""}
              </p>
              {logs.length === 0 ? (
                <Empty>No time logged yet.</Empty>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Latest time logs</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="whitespace-nowrap">{formatYmd(l.date, { day: "numeric", month: "short" })}</TableCell>
                          <TableCell className="max-w-48 truncate">{l.project || "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.hours}</TableCell>
                          <TableCell className="capitalize">{l.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Leave and work from home" href="/timesheet/admin/approvals" action="Approvals">
          {!leave ? (
            <Unavailable what="leave" />
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="text-2xl font-semibold tabular-nums text-foreground">{leave.daysThisYear}</span> leave days taken this year
              </p>
              {leave.requests.length === 0 ? (
                <Empty>No requests yet.</Empty>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {leave.requests.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium">{r.compOff ? "Comp-off leave" : r.type === "wfh" ? "Work from home" : "Leave"}</span>
                        <span className="block text-xs text-muted-foreground">{formatRange(r.from, r.to)}</span>
                        {r.reason && <span className="block truncate text-xs text-muted-foreground">{r.reason}</span>}
                      </span>
                      <Badge variant="outline" className={r.status === "approved" ? "border-foreground" : r.status === "rejected" ? "border-dashed" : ""}>
                        {r.status === "approved" ? "✓ Approved" : r.status === "rejected" ? "✕ Rejected" : "○ Pending"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Expenses" href={`/timesheet/payroll/expenses?q=${encodeURIComponent(person.email)}&filter=all`} action="Review claims">
          {!expenses ? (
            <Unavailable what="expenses" />
          ) : (
            <div className="grid gap-3">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Waiting" value={formatMoney(claimTotal(["pending"]))} />
                <Stat label="Going into payroll" value={formatMoney(claimTotal(["approved", "added_to_payroll"]))} />
                <Stat label="Reimbursed" value={formatMoney(claimTotal(["reimbursed"]))} />
              </dl>
              {expenses.length === 0 ? (
                <Empty>No claims yet.</Empty>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Latest expense claims</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.slice(0, 6).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap">
                            <span className="font-medium">{c.code}</span>
                            <span className="block text-xs text-muted-foreground">{formatYmd(c.date, { day: "numeric", month: "short" })}</span>
                          </TableCell>
                          <TableCell>{c.category}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(c.approved ?? c.claimed)}</TableCell>
                          <TableCell>
                            <ExpenseStatusBadge status={c.status} />
                            <span className="sr-only">{STATUS_LABEL[c.status]}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Salary and payslips" href={`/timesheet/payroll/history?employee=${person.userId}`} action="Full payroll history">
          {salary === undefined || !payslips ? (
            <Unavailable what="salary" />
          ) : (
            <div className="grid gap-3">
              {salary ? (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Monthly gross" value={formatMoney(salary.basic + salary.hra + salary.allowances)} />
                  <Stat label="Basic" value={formatMoney(salary.basic)} />
                  <Stat label="HRA" value={formatMoney(salary.hra)} />
                  <Stat label="Fixed deductions" value={formatMoney(salary.deductions)} />
                </dl>
              ) : (
                <Empty>
                  No salary structure yet.{" "}
                  <Link href="/timesheet/payroll/structures" className="underline underline-offset-4">
                    Set one up
                  </Link>
                </Empty>
              )}
              {salary && (
                <p className="text-xs text-muted-foreground">
                  In force since {day(salary.effectiveFrom)}.{" "}
                  <Link href="/timesheet/payroll/structures" className="underline underline-offset-4">
                    Change salary
                  </Link>
                </p>
              )}
              {payslips.length === 0 ? (
                <Empty>No payslips yet. They appear when a payroll run is finalized.</Empty>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <caption className="sr-only">Latest payslips</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Bonus</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.slice(0, 6).map((p) => {
                        const b = payBreakdown(p.payslip);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap">
                              <Link href={`/timesheet/payroll/runs/${p.runId}`} className="font-medium underline-offset-4 hover:underline">
                                {formatYmd(`${p.month}-01`, { month: "short", year: "numeric" })}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{b.bonus > 0 ? formatMoney(b.bonus, p.currency) : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.expenses > 0 ? formatMoney(b.expenses, p.currency) : "-"}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatMoney(b.total, p.currency)}</TableCell>
                            <TableCell>
                              <RunStatusBadge status={p.status} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
