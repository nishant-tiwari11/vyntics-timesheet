import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isUuid } from "@/lib/avatar";
import { loadTeamMember, type TeamMemberView } from "@/lib/access/teamMember";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatRange, formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { KIND_LABEL, PART_LABEL, dayWord, isLeaveKind, isDayPart } from "@/lib/timesheet/leaveCore";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { UserAvatar } from "../../../_components/UserAvatar";

export const metadata = { title: "Team member" };
export const dynamic = "force-dynamic";

const Stat = ({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) => (
  <li className="rounded-xl border bg-card p-4">
    <span className="block text-sm text-muted-foreground">{label}</span>
    <span className={cn("mt-1 block text-3xl font-semibold tabular-nums", bad && "text-destructive")}>{value}</span>
    {note && <span className="block text-xs text-muted-foreground">{note}</span>}
  </li>
);

// One person on your team: their work logs, leave and work from home, and balances. Read only. Decisions on their requests are
// made on Team approvals.
export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "manager" && me?.role !== "admin") redirect("/timesheet/dashboard");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let v: TeamMemberView | null = null;
  let error: string | null = null;
  try {
    v = await loadTeamMember(id);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("team member page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  const back = (
    <Link href="/timesheet/team" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
      ← Team
    </Link>
  );
  if (error || !v) {
    return (
      <div className="grid gap-3">
        {back}
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Couldn't load this person."}
        </p>
      </div>
    );
  }
  const b = v.balances;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        {back}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar userId={v.id} name={v.name} className="size-14 text-lg" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight break-words">{v.name}</h1>
              <p className="text-sm break-all text-muted-foreground">{v.email}</p>
            </div>
          </div>
          <Link href="/timesheet/team/approvals" className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent">
            Team approvals
          </Link>
        </header>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Hours, last 7 days" value={`${v.weekHours} h`} />
        <Stat label="Hours this month" value={`${v.monthHours} h`} />
        <Stat label="Paid leave left" value={b ? `${b.paidLeft}` : "-"} note={b ? `${b.paidUsed} of ${b.quota} used this month` : undefined} />
        <Stat label="Comp-off balance" value={b ? `${b.compOff.balance}` : "-"} bad={!!b && b.compOff.balance < 0} note={b && b.compOff.balance < 0 ? `owes ${b.compOff.shortfall}` : b && b.compOff.expiringSoon > 0 ? `${b.compOff.expiringSoon} expiring soon` : undefined} />
      </ul>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Work logs">
          <h2 className="text-base font-semibold">Work logs</h2>
          {!v.logs ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load work logs.</p>
          ) : v.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Latest work logs</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>What they did</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{formatYmd(l.date, { weekday: "short", day: "numeric", month: "short" })}</TableCell>
                      <TableCell className="max-w-32 truncate">{l.project || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.hours}</TableCell>
                      <TableCell className="max-w-64 break-words whitespace-normal">{l.text}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Leave and work from home">
          <h2 className="text-base font-semibold">Leave and work from home</h2>
          {!v.requests ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load requests.</p>
          ) : v.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {v.requests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {r.type === "wfh" ? "Work from home" : r.kind && isLeaveKind(r.kind) && r.status === "approved" ? KIND_LABEL[r.kind] : "Leave"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRange(r.from, r.to)}
                      {isDayPart(r.part) && r.part !== "full" ? ` · ${PART_LABEL[r.part]}` : ""}
                    </span>
                    {r.reason && <span className="block truncate text-xs text-muted-foreground">{r.reason}</span>}
                  </span>
                  <Badge variant="outline" className={r.status === "approved" ? "border-foreground" : r.status === "rejected" ? "border-dashed" : ""}>
                    {r.status === "approved" ? "✓ Approved" : r.status === "rejected" ? "✕ Rejected" : r.status === "pending" ? "○ Waiting" : "Cancelled"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {b && b.compOff.balance < 0 && <p className="text-xs text-muted-foreground">Owes {dayWord(b.compOff.shortfall)} of comp-off, to be earned back by working a weekend or holiday.</p>}
        </section>
      </div>
    </div>
  );
}
