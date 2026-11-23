import Link from "next/link";
import { ArrowRight, CalendarClock, Clock, Home, Palmtree, Receipt, UserPlus, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadAdminOverview } from "@/lib/admin/overview";
import { loadCompanyOverview, type CompanyOverview, type Person } from "@/lib/admin/company";
import { formatMoney } from "@/lib/payroll/money";
import { formatTodayLong, formatYmd, greeting } from "@/lib/timesheet/dates";
import { holidayTypeLabel } from "@/lib/timesheet/holidayTypes";
import { UserAvatar } from "../../_components/UserAvatar";
import RunStatusBadge from "../payroll/RunStatusBadge";
import { ROLE_LABEL, toRole } from "@/lib/access/config";
import { avatarUrl } from "@/lib/avatar";
import type { LanyardMember } from "@/components/ui/team-lanyard-rail";
import { AttentionList } from "./AttentionList";
import { EmployeeRailLazy as EmployeeRail } from "./EmployeeRailLazy";

const card = "rounded-xl border bg-card p-4";
const link = "inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
const dash = "–";

type Kpi = { label: string; value: string; note: string; href: string; icon: typeof Users; alert?: boolean };

function Section({ title, href, action, children, className = "" }: { title: string; href?: string; action?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} ${className}`} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className={link}>
            {action ?? "Open"} <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function PeopleList({ people, empty }: { people: Person[]; empty: string }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {people.slice(0, 5).map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm">
          <UserAvatar userId={p.id} name={p.name} className="size-6 text-[11px]" />
          <span className="min-w-0 truncate">{p.name}</span>
        </li>
      ))}
      {people.length > 5 && <li className="text-xs text-muted-foreground">and {people.length - 5} more</li>}
    </ul>
  );
}

function Bars({ rows, unit = "" }: { rows: { name: string; count: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.name} className="grid gap-1 text-sm">
          <span className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {r.count}
              {unit}
            </span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeekChart({ week, today }: { week: NonNullable<CompanyOverview["week"]>; today: string }) {
  const max = Math.max(1, ...week.days.map((d) => d.hours));
  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{week.total}</span> hours logged this week
        </p>
        <ul className="flex h-32 items-end gap-2" aria-label="Hours logged each day this week">
          {week.days.map((d) => (
            <li key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px] tabular-nums text-muted-foreground">{d.hours > 0 ? d.hours : ""}</span>
              <span
                className={`w-full rounded-md ${d.date === today ? "bg-primary" : "bg-primary/35"}`}
                style={{ height: `${Math.max(d.hours > 0 ? 6 : 2, (d.hours / max) * 80)}%` }}
                aria-hidden="true"
              />
              <span className={`text-[11px] ${d.date === today ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{formatYmd(d.date, { weekday: "short" })}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Where the time went</h3>
        <Bars rows={week.projects} unit=" h" />
      </div>
    </div>
  );
}

function kpis(o: Awaited<ReturnType<typeof loadAdminOverview>>, c: CompanyOverview): Kpi[] {
  const n = (v: number | null | undefined) => (v == null ? dash : String(v));
  return [
    { label: "Employees", value: n(c.headcount?.total), note: c.headcount?.newJoiners.length ? `${c.headcount.newJoiners.length} joined this month` : "active accounts", href: "/timesheet/admin/access", icon: Users },
    { label: "Working today", value: n(c.now?.present), note: c.now?.dayOff ? `today is a ${c.now.dayOff}` : "have logged time", href: "/timesheet/worklog", icon: Clock },
    { label: "On leave", value: n(c.now?.onLeave.length), note: "approved leave today", href: "/timesheet/calendar", icon: Palmtree },
    { label: "Work from home", value: n(c.now?.wfh.length), note: "approved today", href: "/timesheet/calendar", icon: Home },
    { label: "Waiting for you", value: String(o.waitingTotal), note: "approvals and reviews", href: "/timesheet/admin/approvals", icon: CalendarClock, alert: o.waitingTotal > 0 },
    { label: "Expense claims", value: n(c.expenses?.pending), note: c.expenses ? `${formatMoney(c.expenses.pendingAmount)} to approve` : "to approve", href: "/timesheet/payroll/expenses", icon: Receipt, alert: (c.expenses?.pending ?? 0) > 0 },
  ];
}

// The Admin front page: the whole company at a glance. Everything is fetched at once and each piece fails on its own, so a
// section that can't load shows a dash or a short note instead of taking the page down.
export async function AdminOverview({ name }: { name: string }) {
  const [overview, company] = await Promise.all([loadAdminOverview(), loadCompanyOverview()]);
  const { headcount, now, week, payroll, expenses, holidays, people } = company;
  const badges: LanyardMember[] = (people ?? []).map((p) => {
    const role = toRole(p.role) ?? "employee";
    return {
      id: p.id,
      name: p.name,
      role: ROLE_LABEL[role],
      team: "Vyntics",
      image: avatarUrl(p.id),
      tone: role === "admin" ? 1 : role === "manager" ? 2 : role === "employee" ? 3 : 4,
      bio: `Joined ${formatYmd(p.joinedOn, { day: "numeric", month: "short", year: "numeric" })}.`,
      tags: [ROLE_LABEL[role]],
      links: [
        { label: "Email", href: `mailto:${p.email}` },
        { label: "Profile", href: `/timesheet/admin/access/${p.id}` },
      ],
    };
  });
  const run = payroll?.latest ?? null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="ts-h1">
            {greeting()}, {name.split(" ")[0]}
          </h1>
          <p className="ts-muted">{formatTodayLong()} · here is where the company stands.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/timesheet/admin/access" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent max-md:min-h-11">
            <UserPlus className="size-4" aria-hidden="true" /> Add employee
          </Link>
          <Link href="/timesheet/payroll/runs" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 max-md:min-h-11">
            <Wallet className="size-4" aria-hidden="true" /> Payroll
          </Link>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Summary">
        {kpis(overview, company).map(({ label, value, note, href, icon: Icon, alert }) => (
          <li key={label}>
            <Link href={href} className="group flex h-full items-start justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground max-md:min-h-11">
              <span className="min-w-0">
                <span className="block text-sm text-muted-foreground">{label}</span>
                <span className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums">
                  {value}
                  {alert && <span className="size-2 rounded-full bg-orange-600" aria-label="Needs attention" />}
                </span>
                <span className="block text-xs text-muted-foreground">{note}</span>
              </span>
              <Icon className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {badges.length > 0 && (
        <div className="overflow-clip rounded-xl">
          <EmployeeRail items={badges} total={badges.length} people={Object.fromEntries((people ?? []).map((p) => [p.id, { id: p.id, name: p.name, email: p.email, role: ROLE_LABEL[toRole(p.role) ?? "employee"] }]))} />
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid min-w-0 gap-5">
          <AttentionList items={overview.attention} total={overview.waitingTotal} />
          <Section title="Hours this week" href="/timesheet/worklog" action="Work logs">
            {week ? <WeekChart week={week} today={company.today} /> : <p className="text-sm text-muted-foreground">Couldn&apos;t load this week&apos;s hours.</p>}
          </Section>
        </div>

        <div className="grid min-w-0 gap-5">
          <Section title="Today" href="/timesheet/calendar" action="Calendar">
            {now ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="mb-1.5 text-sm font-medium">On leave ({now.onLeave.length})</h3>
                  <PeopleList people={now.onLeave} empty="Nobody is on leave." />
                </div>
                <div>
                  <h3 className="mb-1.5 text-sm font-medium">Working from home ({now.wfh.length})</h3>
                  <PeopleList people={now.wfh} empty="Nobody is working from home." />
                </div>
                {now.notLogged !== null && (
                  <p className="border-t pt-3 text-sm text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">{now.notLogged}</span> haven&apos;t logged any time yet.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load today&apos;s picture.</p>
            )}
          </Section>

          <Section title="Payroll" href="/timesheet/payroll/runs" action="Runs">
            {!payroll ? (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load payroll.</p>
            ) : !run ? (
              <p className="text-sm text-muted-foreground">No payroll run yet. Create the first one for this month.</p>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{formatYmd(`${run.month}-01`, { month: "long", year: "numeric" })}</span>
                  <RunStatusBadge status={run.status} />
                </div>
                <p className="text-2xl font-semibold tabular-nums">{run.netTotal != null ? formatMoney(run.netTotal) : dash}</p>
                <p className="text-xs text-muted-foreground">
                  {run.employees ?? 0} payslips{run.paidOn ? ` · paid ${formatYmd(run.paidOn, { day: "numeric", month: "short" })}` : ""}
                  {payroll.open > 0 ? ` · ${payroll.open} open ${payroll.open === 1 ? "run" : "runs"}` : ""}
                </p>
              </div>
            )}
          </Section>

          <Section title="Expenses" href="/timesheet/payroll/expenses" action="Review">
            {expenses ? (
              <dl className="grid gap-2 text-sm">
                {[
                  ["Waiting for approval", `${formatMoney(expenses.pendingAmount)} (${expenses.pending})`],
                  ["Approved, going into payroll", formatMoney(expenses.approvedAmount)],
                  ["Reimbursed this month", formatMoney(expenses.reimbursedAmount)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load expenses.</p>
            )}
          </Section>

          <Section title="People" href="/timesheet/admin/access" action="Employees">
            {headcount ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="mb-2 text-sm font-medium">By department</h3>
                  <Bars rows={headcount.departments} />
                </div>
                {headcount.newJoiners.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-sm font-medium">New in the last 30 days</h3>
                    <ul className="grid gap-1.5 text-sm">
                      {headcount.newJoiners.map((p) => (
                        <li key={p.id} className="flex justify-between gap-3">
                          <span className="truncate">{p.name}</span>
                          <span className="text-muted-foreground">{formatYmd(p.joinedOn, { day: "numeric", month: "short" })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="border-t pt-3 text-xs text-muted-foreground">{headcount.roles.map((r) => `${r.count} ${r.name.toLowerCase()}`).join(" · ")}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load people.</p>
            )}
          </Section>

          <Section title="Upcoming holidays" href="/timesheet/admin?tab=holidays" action="Manage">
            {!holidays ? (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load holidays.</p>
            ) : holidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holidays added yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{h.name}</span>
                      <span className="text-xs text-muted-foreground">{holidayTypeLabel(h.type)}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatYmd(h.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function AdminOverviewSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" role="status" aria-label="Overview, loading">
      <Skeleton className="h-14 w-80 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="grid gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading the overview…</span>
    </div>
  );
}
