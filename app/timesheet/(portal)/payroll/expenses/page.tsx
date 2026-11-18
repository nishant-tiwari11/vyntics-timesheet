import Link from "next/link";
import { UserAvatar } from "../../../_components/UserAvatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approvalMonths, listAllClaims, listCategories, type MonthChoice } from "@/lib/expenses/server";
import { ADMIN_FILTERS, isAdminFilter, monthLabel, payrollNote, type AdminFilter, type CategoryRow, type ClaimRow } from "@/lib/expenses/types";
import { formatMoney } from "@/lib/payroll/money";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import ExpenseStatusBadge from "../../expenses/StatusBadge";
import { CategoryEditor, ClaimDecision } from "./ExpenseAdminControls";

export const metadata = { title: "Payroll · Expenses" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everyone's expense claims, for approving and for seeing what will go into (or has gone into) each payroll run.
// The payroll layout around this page already turns non-admins away; the data functions check again.
export default async function PayrollExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter: AdminFilter = isAdminFilter(one(raw.filter)) ? (one(raw.filter) as AdminFilter) : "pending";
  const runId = UUID.test(one(raw.run)) ? one(raw.run) : null;
  const q = one(raw.q).slice(0, 80);

  let claims: ClaimRow[] = [];
  let categories: CategoryRow[] = [];
  let months: MonthChoice[] = [];
  let defaultMonth = "";
  let error: string | null = null;
  try {
    const [list, cats, choice] = await Promise.all([listAllClaims({ filter: runId ? "all" : filter, runId, q }), listCategories(true), approvalMonths()]);
    claims = list;
    categories = cats;
    months = choice.months;
    defaultMonth = choice.defaultMonth;
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("payroll-expenses-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  const params = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = { filter: runId ? null : filter, run: runId, q: q || null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const catBy = new Map(categories.map((c) => [c.id, c]));
  const total = claims.reduce((n, c) => n + (c.approved ?? 0), 0);

  return (
    <section className="grid gap-5" aria-label="Expenses">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Expenses</h2>
          <p className="text-sm text-muted-foreground">Approve claims and choose the payroll month they are paid with. Only the approved amount reaches salary.</p>
        </div>
        <a
          href={`/timesheet/payroll/expenses/export${params({})}`}
          className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:border-foreground hover:bg-accent max-md:min-h-11"
        >
          Export CSV
        </a>
      </div>

      {runId ? (
        <p role="note" className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
          Showing only the expenses in one payroll run.
          <Link href={`/timesheet/payroll/runs/${runId}`} className="underline underline-offset-4">
            Back to the run
          </Link>
          <Link href="/timesheet/payroll/expenses" className="underline underline-offset-4">
            Show all expenses
          </Link>
        </p>
      ) : (
        <nav aria-label="Expense filters" className="flex gap-1 overflow-x-auto border-b">
          {ADMIN_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/timesheet/payroll/expenses${params({ filter: f.id })}`}
              aria-current={filter === f.id ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors md:min-h-10",
                filter === f.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      )}

      <form method="get" className="flex flex-wrap gap-2" role="search" aria-label="Search expenses">
        {runId ? <input type="hidden" name="run" value={runId} /> : <input type="hidden" name="filter" value={filter} />}
        <input
          name="q"
          defaultValue={q}
          maxLength={80}
          placeholder="Search by name, claim ID or description"
          aria-label="Search expenses"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm max-md:min-h-11"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent max-md:min-h-11">
          Search
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : claims.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No expenses here</strong>
          <p>Nothing matches this view.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {claims.length} {claims.length === 1 ? "claim" : "claims"} · approved total <span className="tabular-nums">{formatMoney(total)}</span>
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Expense claims</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
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
                    <TableCell className="min-w-40">
                      <div className="flex items-center gap-2 font-medium">
                        <UserAvatar userId={c.userId} name={c.employee} className="size-7 text-xs" />
                        {c.employee}
                      </div>
                      <div className="max-w-56 text-xs break-words whitespace-normal text-muted-foreground">{c.description}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{day(c.date)}</TableCell>
                    <TableCell>
                      {c.category}
                      {c.taxable ? <span className="block text-xs text-muted-foreground">taxable</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.claimed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.approved === null ? "-" : formatMoney(c.approved)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.payrollMonth ? monthLabel(c.payrollMonth) : "-"}
                      {c.payrollRunId && (
                        <Link href={`/timesheet/payroll/runs/${c.payrollRunId}`} className="block text-xs underline underline-offset-4">
                          Open run
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="min-w-44">
                      <ExpenseStatusBadge status={c.status} />
                      <p className="mt-1 text-xs text-muted-foreground">{payrollNote(c)}</p>
                      {c.decidedBy && c.status !== "pending" && (
                        <p className="text-xs text-muted-foreground">
                          By {c.decidedBy}
                          {c.decidedAt ? `, ${day(c.decidedAt.slice(0, 10))}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClaimDecision claim={c} category={catBy.get(c.categoryId)} months={months} defaultMonth={defaultMonth} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!error && (
        <section aria-label="Expense categories" className="grid gap-3 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Categories</h3>
              <p className="text-sm text-muted-foreground">A limit caps what can be approved for one claim. Taxable categories are paid as ordinary earnings; the rest stay out of tax, PF and ESI.</p>
            </div>
            <CategoryEditor />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Expense categories</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Limit per claim</TableHead>
                  <TableHead>Taxable</TableHead>
                  <TableHead>Available to employees</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.limit === null ? "No limit" : formatMoney(c.limit)}</TableCell>
                    <TableCell>{c.taxable ? "Yes" : "No"}</TableCell>
                    <TableCell>{c.enabled ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <CategoryEditor category={c} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </section>
  );
}
