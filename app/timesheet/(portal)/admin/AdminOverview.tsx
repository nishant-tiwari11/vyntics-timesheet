import Link from "next/link";
import { CalendarClock, ClipboardX, Receipt, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminOverview, type AdminOverview as Overview } from "@/lib/admin/overview";
import { formatTodayLong } from "@/lib/timesheet/dates";
import { AttentionList } from "./AttentionList";

type Card = { label: string; value: number | null; note: string; href: string; icon: typeof Users; alert?: boolean };

function cards(o: Overview): Card[] {
  return [
    { label: "Employees", value: o.employees, note: "active accounts", href: "/timesheet/admin/access", icon: Users },
    {
      label: "Pending requests",
      value: o.pendingRequests,
      note: "leave and work from home",
      href: "/timesheet/admin?tab=requests",
      icon: CalendarClock,
      alert: (o.pendingRequests ?? 0) > 0,
    },
    {
      label: "Pending expenses",
      value: o.pendingExpenses,
      note: "claims to approve",
      href: "/timesheet/payroll/expenses",
      icon: Receipt,
      alert: (o.pendingExpenses ?? 0) > 0,
    },
    {
      label: "Not logged today",
      value: o.notLogged,
      note: o.dayOff ? `today is a ${o.dayOff}` : "no time logged yet",
      href: "/timesheet/admin?tab=logs",
      icon: ClipboardX,
      alert: (o.notLogged ?? 0) > 0,
    },
  ];
}

// The Admin front page: four numbers, and what is waiting for a decision. Everything here is fetched at once, and a piece that
// can't load shows a dash instead of taking the page down.
export async function AdminOverview() {
  const overview = await loadAdminOverview();
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
        {cards(overview).map(({ label, value, note, href, icon: Icon, alert }) => (
          <li key={label}>
            <Link href={href} className="group flex h-full items-start justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground max-md:min-h-11">
              <span className="min-w-0">
                <span className="block text-sm text-muted-foreground">{label}</span>
                <span className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums">
                  {value ?? "–"}
                  {alert && <span className="size-2 rounded-full bg-orange-600" aria-label="Needs attention" />}
                </span>
                <span className="block text-xs text-muted-foreground">{note}</span>
              </span>
              <Icon className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <AttentionList items={overview.attention} total={overview.waitingTotal} />
    </>
  );
}

export function AdminOverviewSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" role="status" aria-label="Overview, loading">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-none" />
        ))}
      </div>
      <span className="sr-only">Loading the overview…</span>
    </div>
  );
}

export const overviewHeading = (
  <div className="grid gap-1">
    <h1 className="ts-h1">Admin overview</h1>
    <p className="ts-muted">{formatTodayLong()}</p>
  </div>
);
