"use client";

import { usePathname } from "next/navigation";

// The page title for the payroll pages that don't draw their own. (Expenses, history and a single run have their own heading.)
const HEADINGS: [string, string, string][] = [
  ["/timesheet/payroll/structures", "Salary structures", "Each employee's monthly pay: basic, HRA, allowances and fixed deductions, with the date it starts."],
  ["/timesheet/payroll/queries", "Payslip queries", "Questions employees raised about a payslip. Reply to resolve them."],
  ["/timesheet/payroll/settings", "Payroll settings", "How pay is worked out: the pay cycle, leave and overtime rules, and salary components."],
];

export default function PayrollHeading() {
  const pathname = usePathname().replace(/\/$/, "");
  if (pathname === "/timesheet/payroll/runs") {
    return (
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll runs</h1>
        <p className="text-sm text-muted-foreground">One run per pay month. Salary data is private to admins and every view and change is recorded.</p>
      </div>
    );
  }
  const match = HEADINGS.find(([p]) => pathname.startsWith(p));
  if (!match) return null;
  return (
    <div className="grid gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{match[1]}</h1>
      <p className="text-sm text-muted-foreground">{match[2]}</p>
    </div>
  );
}
