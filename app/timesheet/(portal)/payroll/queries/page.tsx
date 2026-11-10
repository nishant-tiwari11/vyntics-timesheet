import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAllQueries, type QueryRow } from "@/lib/payroll/queries";
import { formatInstantDate, formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { AnswerQuery } from "./QueryControls";

export const metadata = { title: "Payroll · Queries" };
export const dynamic = "force-dynamic";

const pill = (active: boolean) =>
  cn("inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent", active && "border-primary bg-primary text-primary-foreground hover:bg-primary");

export default async function QueriesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: raw } = await searchParams;
  const filter = raw === "all" ? "all" : "open";
  let rows: QueryRow[] = [];
  let error: string | null = null;
  try {
    rows = await listAllQueries(filter);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("payroll-queries", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <section className="grid gap-4" aria-label="Payslip queries">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">Questions employees raise about their payslips. Reply here and mark them resolved. In-app only: there is no email.</p>
        <nav aria-label="Filter queries" className="flex gap-1.5">
          <Link href="/timesheet/payroll/queries" aria-current={filter === "open" ? "page" : undefined} className={pill(filter === "open")}>
            Open
          </Link>
          <Link href="/timesheet/payroll/queries?filter=all" aria-current={filter === "all" ? "page" : undefined} className={pill(filter === "all")}>
            All
          </Link>
        </nav>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>{filter === "open" ? "No open queries" : "No queries yet"}</strong>
          <p>When an employee raises a question about a payslip, it appears here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Payslip queries</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Payslip</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{q.month ? formatYmd(`${q.month}-01`, { month: "short", year: "numeric" }) : "—"}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal">{q.topic}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatInstantDate(q.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={q.status === "open" ? "border-dashed" : ""}>
                      {q.status === "open" ? "○ Open" : "✓ Resolved"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AnswerQuery id={q.id} who={q.name} topic={q.topic} message={q.message} status={q.status} reply={q.reply} />
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
