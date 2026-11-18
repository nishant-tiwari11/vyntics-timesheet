import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCategories, listMyClaims } from "@/lib/expenses/server";
import { monthLabel, payrollNote, type CategoryRow, type ClaimRow } from "@/lib/expenses/types";
import { formatMoney } from "@/lib/payroll/money";
import { formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { ClaimForm, RowActions } from "./ExpenseControls";
import ExpenseStatusBadge from "./StatusBadge";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

// Your own expense claims. Approved ones are paid back with your salary: the "Payroll month" column and the note under
// each status say which month's salary they will be paid with.
export default async function ExpensesPage() {
  let claims: ClaimRow[] = [];
  let categories: CategoryRow[] = [];
  let error: string | null = null;
  try {
    [claims, categories] = await Promise.all([listMyClaims(), listCategories()]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("expenses-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }
  const today = todayInOffice();

  if (error) {
    return (
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
        <Link href="/timesheet/expenses" className="w-fit text-sm underline underline-offset-4">
          Try again
        </Link>
      </div>
    );
  }

  const waiting = claims.filter((c) => c.status === "approved" || c.status === "added_to_payroll").reduce((n, c) => n + (c.approved ?? 0), 0);
  const paid = claims.filter((c) => c.status === "reimbursed").reduce((n, c) => n + (c.approved ?? 0), 0);
  const pending = claims.filter((c) => c.status === "pending").length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">Claim money you spent for work. Once approved, it is paid back with your salary, as a separate line on your payslip.</p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Waiting for approval</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{pending}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Approved, to be paid with salary</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(waiting)}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Reimbursed</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(paid)}</dd>
        </div>
      </dl>

      <section aria-label="New expense" className="grid gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">New expense</h2>
        <ClaimForm categories={categories} today={today} />
      </section>

      <section aria-label="My expenses" className="grid gap-3">
        <h2 className="text-base font-semibold">My claims</h2>
        {claims.length === 0 ? (
          <div className="ts-card ts-empty">
            <strong>No expenses yet</strong>
            <p>Add one above. It goes to an admin for approval.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Your expense claims, newest first</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Claimed</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Payroll month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium whitespace-nowrap">{c.code}</TableCell>
                    <TableCell className="whitespace-nowrap">{day(c.date)}</TableCell>
                    <TableCell>{c.category}</TableCell>
                    <TableCell className="max-w-64 break-words whitespace-normal">{c.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.claimed)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.approved === null ? "-" : formatMoney(c.approved)}
                      {c.approved !== null && c.approved < c.claimed && <span className="block text-xs text-muted-foreground">of {formatMoney(c.claimed)}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.payrollMonth ? monthLabel(c.payrollMonth) : "-"}</TableCell>
                    <TableCell className="min-w-48">
                      <ExpenseStatusBadge status={c.status} />
                      <p className="mt-1 text-xs text-muted-foreground">{payrollNote(c)}</p>
                    </TableCell>
                    <TableCell>
                      <RowActions claim={c} categories={categories} today={today} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
