"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, FolderCheck, Palmtree, Receipt, UserRound, Wallet } from "lucide-react";
import RadialOrbitalTimeline, { type TimelineItem } from "@/components/ui/radial-orbital-timeline";
import type { EmployeeToday } from "@/lib/admin/employeeToday";
import { formatMoney } from "@/lib/payroll/money";
import { formatRange, formatYmd } from "@/lib/timesheet/dates";
import { KIND_LABEL, dayWord, isLeaveKind } from "@/lib/timesheet/leaveCore";
import { UserAvatar } from "../../_components/UserAvatar";
import { loadEmployeeTodayAction } from "./dialerActions";

export type DialerPerson = { id: string; name: string; email: string; role: string };

const TARGET_HOURS = 8;
const day = (d: string) => formatYmd(d, { day: "numeric", month: "short" });

function itemsFor(p: DialerPerson, t: EmployeeToday | null, failed: string | null): TimelineItem[] {
  const wait = failed ? failed : "Loading today's picture…";
  const today = t ? day(t.today) : "Today";
  const base = (id: number, title: string, icon: TimelineItem["icon"], related: number[]) => ({
    id,
    title,
    date: today,
    icon,
    category: title,
    relatedIds: related,
    energy: 50,
  });

  // 1. Work log
  const w = t?.workLog;
  const workLog: TimelineItem = {
    ...base(1, "Work log", Briefcase, [2]),
    status: !t ? "pending" : (w?.hours ?? 0) > 0 ? "completed" : "pending",
    statusLabel: !t ? "…" : (w?.hours ?? 0) > 0 ? "LOGGED" : t.dayOff ? "DAY OFF" : "NOT LOGGED YET",
    content: !t ? wait : !w ? "Couldn't load the work log." : w.entries.length === 0 ? (t.dayOff ? "Today is a day off, so no time is expected." : "No time logged yet today.") : `${w.entries.length} ${w.entries.length === 1 ? "entry" : "entries"} today.`,
    details: w && w.entries.length > 0 ? [...w.entries.slice(0, 3).map((e) => ({ label: e.project || "Entry", value: `${e.hours} h` })), ...(w.entries.length > 3 ? [{ label: "and", value: `${w.entries.length - 3} more` }] : []), { label: "Last 7 days", value: `${w.weekHours} h` }] : w ? [{ label: "Last 7 days", value: `${w.weekHours} h` }] : undefined,
    meter: w ? { label: "Hours today", value: Math.round((w.hours / TARGET_HOURS) * 100), text: `${w.hours} / ${TARGET_HOURS} h` } : undefined,
    href: t ? `/timesheet/admin/popup/worklog?view=day&date=${t.today}&user=${p.id}` : undefined,
    hrefLabel: "View full work log",
  };

  // 2. Leave and work from home
  const l = t?.leave;
  const here = l?.today;
  const leave: TimelineItem = {
    ...base(2, "Leave & WFH", Palmtree, [1, 3]),
    status: !t ? "pending" : here ? "in-progress" : "completed",
    statusLabel: !t ? "…" : here ? (here.type === "wfh" ? "WORKING FROM HOME" : "ON LEAVE") : "IN",
    content: !t ? wait : !l ? "Couldn't load leave." : here ? (here.type === "wfh" ? "Approved to work from home today." : `On approved ${here.kind && isLeaveKind(here.kind) ? KIND_LABEL[here.kind].toLowerCase() : "leave"} today.`) : "Not on leave or working from home today.",
    details: l
      ? [
          ...(l.balances ? [{ label: "Paid leave left", value: `${l.balances.paidLeft} of ${l.balances.quota}` }, { label: "Comp-off balance", value: dayWord(l.balances.compOff.balance) }] : []),
          { label: "Waiting for a decision", value: String(l.pending) },
          ...(l.upcoming ? [{ label: l.upcoming.type === "wfh" ? "Next WFH" : "Next leave", value: formatRange(l.upcoming.from, l.upcoming.to) }] : []),
        ]
      : undefined,
    meter: l?.balances && l.balances.quota > 0 ? { label: "Paid leave used this month", value: Math.round((l.balances.paidUsed / l.balances.quota) * 100), text: `${l.balances.paidUsed} / ${l.balances.quota}` } : undefined,
    href: t ? `/timesheet/admin/popup/approvals?employee=${p.id}${l && l.pending > 0 ? "" : "&view=history"}` : undefined,
    hrefLabel: l && l.pending > 0 ? "Review requests" : "View leave history",
  };

  // 3. Expenses
  const e = t?.expenses;
  const expenses: TimelineItem = {
    ...base(3, "Expenses", Receipt, [2, 4]),
    status: !t ? "pending" : (e?.pending ?? 0) > 0 ? "in-progress" : "completed",
    statusLabel: !t ? "…" : (e?.pending ?? 0) > 0 ? `${e?.pending} TO APPROVE` : "ALL CLEAR",
    content: !t ? wait : !e ? "Couldn't load expenses." : e.latest ? `Latest claim ${e.latest.code}, ${e.latest.category}.` : "No expense claims yet.",
    details: e ? [{ label: "Waiting for approval", value: formatMoney(e.pendingAmount) }, { label: "Going into payroll", value: formatMoney(e.approvedAmount) }, ...(e.latest ? [{ label: "Latest amount", value: formatMoney(e.latest.amount) }] : [])] : undefined,
    href: t ? `/timesheet/admin/popup/expenses?q=${encodeURIComponent(p.email)}&filter=all` : undefined,
    hrefLabel: "View all claims",
  };

  // 4. Payroll
  const pr = t?.payroll;
  const payroll: TimelineItem = {
    ...base(4, "Payroll", Wallet, [3, 5]),
    status: !t ? "pending" : pr ? "completed" : "pending",
    statusLabel: !t ? "…" : pr ? (pr.status === "paid" ? "PAID" : "FINALIZED") : "NO PAYSLIP",
    content: !t ? wait : pr === undefined ? "Couldn't load payroll." : pr ? `Latest payslip: ${formatYmd(`${pr.month}-01`, { month: "long", year: "numeric" })}.` : "No payslip yet. It appears when a payroll run is finalized.",
    details: pr ? [{ label: "Net pay", value: formatMoney(pr.net, pr.currency) }, ...(pr.bonus > 0 ? [{ label: "Bonus", value: formatMoney(pr.bonus, pr.currency) }] : []), ...(pr.expenses > 0 ? [{ label: "Expenses reimbursed", value: formatMoney(pr.expenses, pr.currency) }] : [])] : undefined,
    href: t ? `/timesheet/admin/popup/payroll?employee=${p.id}` : undefined,
    hrefLabel: "View payroll history",
  };

  // 5. Documents
  const d = t?.documents;
  const documents: TimelineItem = {
    ...base(5, "Documents", FolderCheck, [4, 6]),
    status: !t ? "pending" : d?.status === "submitted" ? "completed" : d?.status === "in_progress" ? "in-progress" : "pending",
    statusLabel: !t ? "…" : d ? { submitted: "SUBMITTED", in_progress: "IN PROGRESS", skipped: "SKIPPED", not_started: "NOT STARTED" }[d.status] : "UNKNOWN",
    content: !t ? wait : !d ? "Couldn't load documents." : d.rejected > 0 ? `${d.rejected} ${d.rejected === 1 ? "document was" : "documents were"} sent back.` : d.status === "submitted" ? "Onboarding submitted." : d.status === "skipped" ? "Onboarding is skipped for this person." : "Onboarding isn't finished.",
    details: d ? [{ label: "Offer letter", value: d.hasLetters.offer ? "Uploaded" : "To be uploaded" }, { label: "Joining letter", value: d.hasLetters.joining ? "Uploaded" : "To be uploaded" }, { label: "Files submitted", value: String(d.uploaded) }, { label: "Waiting for a check", value: String(d.pending) }] : undefined,
    href: t ? `/timesheet/admin/popup/documents?view=onboarding&employee=${p.id}` : undefined,
    hrefLabel: "Open documents",
  };

  // 6. Profile
  const profile: TimelineItem = {
    ...base(6, "Profile", UserRound, [5]),
    status: "completed",
    statusLabel: p.role.toUpperCase(),
    content: p.email,
    details: [{ label: "Role", value: p.role }],
    href: `/timesheet/admin/popup/employee/${p.id}`,
    hrefLabel: "Open employee page",
  };

  // No details yet (loading or failed) means an empty list, so the stock "Energy Level" bar never shows.
  return [workLog, leave, expenses, payroll, documents, profile].map((it) => ({ ...it, details: it.details ?? [] }));
}

// Shown beside the selected ID badge. Each node previews this person's day.
export function EmployeeOrbit({ person }: { person: DialerPerson }) {
  // The answer is kept with the person it is for, so opening someone else never shows the previous person's day.
  const [result, setResult] = useState<{ id: string; data: EmployeeToday | null; error: string | null } | null>(null);
  const [radius, setRadius] = useState(200);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setRadius(Math.max(105, Math.min(200, (el.clientWidth - 150) / 2)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    loadEmployeeTodayAction(person.id)
      .then((res) => live && setResult(res.ok ? { id: person.id, data: res.data, error: null } : { id: person.id, data: null, error: res.error }))
      .catch(() => live && setResult({ id: person.id, data: null, error: "Couldn't reach the server." }));
    return () => {
      live = false;
    };
  }, [person.id]);

  const mine = result?.id === person.id ? result : null;
  const items = useMemo(() => itemsFor(person, mine?.data ?? null, mine?.error ?? null), [person, mine]);

  return (
    <div ref={box} className="relative h-[500px] w-full">
      <RadialOrbitalTimeline
        timelineData={items}
        theme="light"
        className="h-full"
        radius={radius}
        center={
          <div className="absolute z-10 flex flex-col items-center gap-2">
            <span className="relative grid place-items-center">
              <span className="absolute size-24 rounded-full border border-black/15 animate-ping opacity-60" />
              <span className="absolute size-28 rounded-full border border-black/10 animate-ping opacity-40" style={{ animationDelay: "0.5s" }} />
              <UserAvatar userId={person.id} name={person.name} className="size-16 border-2 border-black/20 text-lg" />
            </span>
            <span className="max-w-40 truncate text-center text-xs font-semibold tracking-wide">{person.name}</span>
            <span className="text-[11px] text-black/75">{person.role}</span>
          </div>
        }
      />
    </div>
  );
}
