import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/payroll/money";
import { audit, getPayrollSettings, listEmployeeStructures } from "@/lib/payroll/server";
import type { EmployeeRow } from "@/lib/payroll/types";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { StructureActions } from "./StructureControls";

export const metadata = { title: "Payroll · Salary structures" };
export const dynamic = "force-dynamic";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

export default async function StructuresPage() {
  let employees: EmployeeRow[] = [];
  let currency = "INR";
  let error: string | null = null;
  try {
    const [list, settings] = await Promise.all([listEmployeeStructures(), getPayrollSettings()]);
    employees = list;
    currency = settings.currency;
    await audit("viewed", "salary_structures", undefined, "Opened the salary structures list");
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("payroll-structures", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  }

  const missing = employees.filter((e) => !e.current && !e.leftOn).length;

  return (
    <section className="grid gap-4" aria-label="Salary structures">
      <p className="text-sm text-muted-foreground">
        One current structure per employee. A salary change is a new entry from its effective date, and the older ones stay in the history.
      </p>
      {missing > 0 && (
        <p role="status" className="rounded-lg border border-dashed p-3 text-sm">
          <strong>
            {missing} {missing === 1 ? "employee has" : "employees have"} no salary structure yet.
          </strong>{" "}
          Payroll gives them no salary until one is added.
        </p>
      )}

      {employees.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No employees yet</strong>
          <p>Employees appear here after they sign in for the first time.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Employees and their current salary structure</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">HRA</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Fixed deductions</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="min-w-44">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.department || "No department"}</div>
                    {e.leftOn && (
                      <Badge variant="outline" className="mt-1 border-dashed">
                        Left {day(e.leftOn)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{day(e.joinedOn)}</TableCell>
                  {e.current ? (
                    <>
                      <TableCell className="text-right tabular-nums">{formatMoney(e.current.basic, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(e.current.hra, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(e.current.allowances, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(e.current.deductions, currency)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {day(e.current.effectiveFrom)}
                        {e.upcoming && <div className="text-xs text-muted-foreground">Next: {day(e.upcoming.effectiveFrom)}</div>}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={5} className="text-muted-foreground">
                      <Badge variant="outline" className="border-dashed">
                        ○ No structure
                      </Badge>
                      {e.upcoming && <span className="ml-2 text-xs">Starts {day(e.upcoming.effectiveFrom)}</span>}
                    </TableCell>
                  )}
                  <TableCell>
                    <StructureActions employee={e} currency={currency} />
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
