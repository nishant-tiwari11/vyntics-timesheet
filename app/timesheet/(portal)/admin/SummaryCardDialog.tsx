"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, Home, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { LeaveToday, PendingClaim, WfhToday, WorkingPerson } from "@/lib/admin/companyModel";
import { formatMoney } from "@/lib/payroll/money";
import { OFFICE_TIME_ZONE, daysInclusive, formatRange, formatYmd } from "@/lib/timesheet/dates";
import { PART_LABEL, isDayPart, isLeaveKind, type DayPart } from "@/lib/timesheet/leaveCore";
import { UserAvatar } from "../../_components/UserAvatar";

type Queue = { label: string; count: number | null; href: string };
export type ExpenseCardData = { pending: number; pendingAmount: number; approvedAmount: number; reimbursedAmount: number; claims: PendingClaim[] };

const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: OFFICE_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
const day = (ymd: string) => formatYmd(ymd, { weekday: "short", day: "numeric", month: "short" });
const KIND_SHORT = { paid: "Paid leave", comp_off: "Comp-off", unpaid: "Unpaid" } as const;
const part = (p: string) => (isDayPart(p) && p !== "full" ? PART_LABEL[p as DayPart] : null);
// The windows opened from the cards are the pages the orb opens: the real page, filtered, in a window over the overview.
const POPUP = "/timesheet/admin/popup";

const Empty = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid justify-items-center gap-1 rounded-xl border border-dashed px-4 py-10 text-center">
    <strong className="text-sm">{title}</strong>
    <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
  </div>
);

// A summary card on the Admin overview that opens a window with the detail behind its number: who is working, who is on leave or
// at home today, what is waiting for you, or the expense claims waiting for a decision. Links inside close the window first.
export function SummaryCardDialog({
  title,
  children,
  working,
  queues,
  leave,
  wfh,
  expenses,
  dutyUnavailable = false,
}: {
  title: string;
  children: ReactNode;
  working?: WorkingPerson[] | null;
  queues?: Queue[];
  leave?: LeaveToday[] | null;
  wfh?: WfhToday[] | null;
  expenses?: ExpenseCardData | null;
  dutyUnavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isLeave = leave !== undefined;
  const isWfh = wfh !== undefined;
  const isExpenses = expenses !== undefined;
  const description = queues
    ? "Choose a category to review its pending items."
    : isLeave
      ? "Everyone on approved leave today. The dates show each person's whole leave."
      : isWfh
        ? "People with approved work from home today, and people who went on duty from home."
        : isExpenses
          ? "Claims waiting for a decision, oldest first. Open one to check it and choose the pay month."
          : "Employees who went on duty or logged time today. Start times are in IST.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="group flex h-full w-full items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring">{children}</button>
      </DialogTrigger>
      <DialogContent className={isExpenses ? "sm:max-w-3xl" : "sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto">
          {dutyUnavailable && <p className="mb-3 text-sm text-muted-foreground">Duty records couldn&apos;t be loaded. This list currently includes employees with logged time.</p>}
          {queues ? (
            <ul className="grid gap-2">
              {queues.map((queue) => <li key={queue.href}><Link href={queue.href} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent"><span className="font-medium">{queue.label}</span><span className="ml-auto tabular-nums">{queue.count ?? "–"}</span><ArrowRight className="size-4" aria-hidden="true" /></Link></li>)}
            </ul>
          ) : isLeave ? (
            <LeaveList rows={leave} close={close} />
          ) : isWfh ? (
            <WfhList rows={wfh} close={close} />
          ) : isExpenses ? (
            <ExpenseList data={expenses} close={close} />
          ) : working == null ? <p className="text-sm text-muted-foreground">Couldn&apos;t load today&apos;s employees.</p> : working.length === 0 ? <p className="text-sm text-muted-foreground">{dutyUnavailable ? "No employees with logged time today." : "Nobody has gone on duty or logged time today."}</p> : (
            <>
              <ul className="divide-y">
                {working.map((person) => <li key={person.id} className="flex items-center gap-3 py-3"><UserAvatar userId={person.id} name={person.name} className="size-9 shrink-0 text-xs" /><div className="min-w-0 flex-1"><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.startedAt ? `${person.onDuty ? "On duty now" : "Off duty"}${person.location === "wfh" ? " · Working from home" : person.location === "office" ? " · Office" : ""}` : "Logged time only"}</p></div><div className="text-right text-sm"><p className="text-xs text-muted-foreground">Duty started</p><p className="font-medium tabular-nums">{person.startedAt ? time(person.startedAt) : "No duty start recorded"}</p></div></li>)}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- On leave today ----------
function LeaveList({ rows, close }: { rows: LeaveToday[] | null; close: () => void }) {
  if (rows === null) return <p className="text-sm text-muted-foreground">Couldn&apos;t load who is on leave.</p>;
  if (rows.length === 0) return <Empty title="Nobody is on leave today">Approved leave for today shows up here.</Empty>;
  return (
    <>
      <ul className="divide-y">
        {[...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r, i) => {
          const days = daysInclusive(r.from, r.to);
          return (
            <li key={`${r.id}-${r.from}-${i}`} className="flex items-center gap-3 py-3">
              <UserAvatar userId={r.id} name={r.name} className="size-9 shrink-0 text-xs" />
              <div className="min-w-0 flex-1">
                <Link href={`${POPUP}/employee/${r.id}`} onClick={close} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatRange(r.from, r.to)} · {days} {days === 1 ? "day" : "days"}
                  {part(r.part) ? ` · ${part(r.part)}` : ""}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{r.kind && isLeaveKind(r.kind) ? KIND_SHORT[r.kind] : "Leave"}</p>
                <p className="text-xs text-muted-foreground">{r.to > r.from ? `Back after ${day(r.to)}` : "Back tomorrow"}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
        <Button asChild size="sm">
          <Link href={`${POPUP}/approvals?view=history`} onClick={close}>
            Leave history <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/timesheet/calendar" onClick={close}>
            Open the calendar
          </Link>
        </Button>
      </div>
    </>
  );
}

// ---------- Working from home today ----------
function WfhList({ rows, close }: { rows: WfhToday[] | null; close: () => void }) {
  if (rows === null) return <p className="text-sm text-muted-foreground">Couldn&apos;t load who works from home.</p>;
  if (rows.length === 0) return <Empty title="Nobody is working from home today">Approved work from home, or going on duty from home, shows up here.</Empty>;
  return (
    <ul className="divide-y">
      {[...rows].sort((a, b) => Number(b.onDuty) - Number(a.onDuty) || a.name.localeCompare(b.name)).map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <UserAvatar userId={r.id} name={r.name} className="size-9 shrink-0 text-xs" />
          <div className="min-w-0 flex-1">
            <Link href={`${POPUP}/employee/${r.id}`} onClick={close} className="font-medium hover:underline">
              {r.name}
            </Link>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Home className="size-3" aria-hidden="true" />
              {r.approved ? `Approved ${formatRange(r.approved.from, r.approved.to)}${part(r.approved.part) ? ` · ${part(r.approved.part)}` : ""}` : "Went on duty from home (no request)"}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{r.onDuty ? "On duty now" : r.dutyStartedAt ? "Off duty" : "Not on duty yet"}</p>
            <p className="text-xs text-muted-foreground">{r.dutyStartedAt ? `Started ${time(r.dutyStartedAt)}` : "No duty start today"}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Expense claims ----------
function ExpenseList({ data, close }: { data: ExpenseCardData | null; close: () => void }) {
  if (data === null) return <p className="text-sm text-muted-foreground">Couldn&apos;t load the expense claims.</p>;
  const more = data.pending - data.claims.length;
  const tiles = [
    { label: "To approve", value: `${data.pending} ${data.pending === 1 ? "claim" : "claims"}`, note: formatMoney(data.pendingAmount) },
    { label: "Going into payroll", value: formatMoney(data.approvedAmount), note: "approved, not yet paid" },
    { label: "Reimbursed this month", value: formatMoney(data.reimbursedAmount), note: "paid back" },
  ];
  return (
    <div className="grid gap-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-muted/30 p-3">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{t.value}</dd>
            <p className="text-xs text-muted-foreground">{t.note}</p>
          </div>
        ))}
      </dl>

      {data.claims.length === 0 ? (
        <Empty title="No claims waiting">When an employee submits an expense claim it appears here for you to approve. Approved claims are paid with the next payroll.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Expense claims waiting for a decision</caption>
            <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">Claim</th>
                <th scope="col" className="px-3 py-2">Employee</th>
                <th scope="col" className="hidden px-3 py-2 sm:table-cell">Spent on</th>
                <th scope="col" className="px-3 py-2 text-right">Amount</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Review</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.claims.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="max-w-56 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Receipt className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-mono text-xs">{c.code}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{c.category}</span>
                    {c.description && <span className="line-clamp-2 text-xs text-muted-foreground">{c.description}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <UserAvatar userId={c.userId} name={c.employee} className="size-6 shrink-0 text-[10px]" />
                      <span className="min-w-0 truncate">{c.employee}</span>
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground sm:table-cell">{day(c.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatMoney(c.claimed)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${POPUP}/expenses?q=${encodeURIComponent(c.code)}&filter=pending`} onClick={close}>
                        Review
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more > 0 && <p className="text-sm text-muted-foreground">and {more} more waiting. Open all claims to see them.</p>}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild size="sm">
          <Link href={`${POPUP}/expenses?filter=pending`} onClick={close}>
            Review all pending claims <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`${POPUP}/expenses?filter=all`} onClick={close}>
            All claims
          </Link>
        </Button>
      </div>
    </div>
  );
}
