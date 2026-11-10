"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Reports arrive in the next step.
const TABS = [
  { href: "/timesheet/payroll/structures", label: "Salary structures" },
  { href: "/timesheet/payroll/runs", label: "Payroll runs" },
  { href: "/timesheet/payroll/queries", label: "Queries" },
  { href: "/timesheet/payroll/settings", label: "Settings" },
];

export default function PayrollTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Payroll sections" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const current = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors md:min-h-10",
              current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
