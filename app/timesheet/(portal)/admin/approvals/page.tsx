import "../../dashboard/dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { loadBalances, loadPendingRequests, type BalanceRow, type PendingRequest } from "@/lib/timesheet/approvals";
import { formatInstantDate, formatRange } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { KIND_LABEL, PART_LABEL, dayWord, isLeaveKind } from "@/lib/timesheet/leaveCore";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { listAllRequests } from "@/lib/timesheet/requests";
import type { RequestWithPerson } from "@/lib/timesheet/types";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { cn } from "@/lib/utils";
import { UserAvatar } from "../../../_components/UserAvatar";
import { CompOffTab } from "../CompOffTab";
import { ExportReport } from "../CompOffControls";
import { RequestCard } from "./RequestCard";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

type View = "requests" | "compoff" | "history" | "balances";
const VIEWS: { id: View; label: string }[] = [
  { id: "requests", label: "Leave & WFH" },
  { id: "compoff", label: "Comp-off credits" },
  { id: "history", label: "History" },
  { id: "balances", label: "Balances" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function safely<T>(what: string, task: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await task() };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError(`approvals: ${what}`, e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}

const Problem = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
    {message}
  </p>
);

const Empty = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="ts-card ts-empty">
    <strong>{title}</strong>
    <p>{children}</p>
  </div>
);

function History({ rows }: { rows: RequestWithPerson[] }) {
  if (rows.length === 0) return <Empty title="Nothing decided yet">Approved and rejected requests will be listed here.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <caption className="sr-only">Decided leave and work from home requests</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const kind = r.leave_kind && isLeaveKind(r.leave_kind) ? KIND_LABEL[r.leave_kind] : r.type === "leave" && r.status === "approved" ? (r.comp_off ? "Comp-off leave" : "Leave") : null;
            const part = r.day_part !== "full" ? ` · ${PART_LABEL[r.day_part as keyof typeof PART_LABEL] ?? ""}` : "";
            return (
              <TableRow key={r.id}>
                <TableCell className="min-w-40">
                  <span className="flex items-center gap-2 font-medium">
                    <UserAvatar userId={r.user_id} name={displayName(r.owner)} className="size-7 text-xs" />
                    {displayName(r.owner)}
                  </span>
                </TableCell>
                <TableCell>{r.type === "wfh" ? "Work from home" : "Leave"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatRange(r.from_date, r.to_date)}
                  {part}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.status === "approved" ? "border-foreground" : "border-dashed"}>
                    {r.status === "approved" ? "✓ Approved" : r.status === "rejected" ? "✕ Rejected" : "Cancelled"}
                  </Badge>
                  {r.status === "approved" && kind && <div className="mt-1 text-xs text-muted-foreground">{kind}</div>}
                  {r.reviewed_at && <div className="text-xs text-muted-foreground">{formatInstantDate(r.reviewed_at)}</div>}
                </TableCell>
                <TableCell className="max-w-64 break-words whitespace-normal text-muted-foreground">{r.admin_note || "-"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Balances({ rows, quota, month }: { rows: BalanceRow[]; quota: number; month: string }) {
  if (rows.length === 0) return <Empty title="No employees yet">Balances appear once people are added.</Empty>;
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <ExportReport rows={rows.map((r) => ({ userId: r.userId, name: r.name, email: r.email, ...r.compOff }))} />
      </div>
      <p className="text-sm text-muted-foreground">
        Each person gets {dayWord(quota)} of paid leave a month, with nothing carried over. Comp-off is earned by working a weekend or holiday and spent when an admin approves leave as comp-off; a negative balance is leave taken
        before it was earned.
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <caption className="sr-only">Paid leave and comp-off balances</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Paid leave this month ({month})</TableHead>
              <TableHead className="text-right">Paid leave left</TableHead>
              <TableHead className="text-right">Comp-off earned</TableHead>
              <TableHead className="text-right">Comp-off balance</TableHead>
              <TableHead className="text-right">Taken this year (paid / comp-off / unpaid)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="min-w-40">
                  <Link href={`/timesheet/admin/access/${r.userId}`} className="flex items-center gap-2 font-medium hover:underline">
                    <UserAvatar userId={r.userId} name={r.name} className="size-7 text-xs" />
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.paid.used} of {r.paid.quota}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{r.paid.left}</TableCell>
                <TableCell className="text-right tabular-nums">{r.compOff.earned}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", r.compOff.balance < 0 && "text-destructive")}>
                  {r.compOff.balance}
                  {r.compOff.balance < 0 && <span className="block text-xs font-normal">owes {r.compOff.shortfall}</span>}
                  {r.compOff.expiringSoon > 0 && <span className="block text-xs font-normal text-muted-foreground">{r.compOff.expiringSoon} expiring soon</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.year.paid} / {r.year.compOff} / {r.year.unpaid}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Where an admin decides what employees ask for: leave and work from home (with what each choice does to paid leave and
// comp-off), comp-off earned for weekend or holiday work, what was decided, and everyone's balances. Time logs are not
// approved here: they are just looked at on the Work logs page.
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const raw = await searchParams;
  const view = VIEWS.find((v) => v.id === one(raw.view))?.id ?? "requests";

  const counts = await safely("counts", getAdminCounts);
  const pendingRequests = view === "requests" ? await safely("requests", loadPendingRequests) : null;
  const history = view === "history" ? await safely("history", async () => (await listAllRequests("all", 100)).filter((r) => r.status !== "pending")) : null;
  const balances = view === "balances" ? await safely("balances", loadBalances) : null;

  const badge = (id: View) => (!counts.ok ? 0 : id === "requests" ? counts.data.requests : id === "compoff" ? counts.data.compOff : 0);

  return (
    <div className="ts-page grid gap-5">
      <div className="grid gap-1">
        <h1 className="ts-h1">Approvals</h1>
        <p className="text-sm text-muted-foreground">Leave, work from home and comp-off. Time logs aren&apos;t approved here; you can see and correct them on the Work logs page.</p>
      </div>

      <nav aria-label="Approval sections" className="flex gap-1 overflow-x-auto border-b">
        {VIEWS.map((v) => {
          const n = badge(v.id);
          return (
            <Link
              key={v.id}
              href={v.id === "requests" ? "/timesheet/admin/approvals" : `/timesheet/admin/approvals?view=${v.id}`}
              aria-current={view === v.id ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors md:min-h-10",
                view === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
              {n > 0 && (
                <span className="rounded-full bg-foreground px-1.5 text-xs text-background">
                  {n}
                  <span className="ts-sr-only"> waiting</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {view === "requests" &&
        pendingRequests &&
        (!pendingRequests.ok ? (
          <Problem message={pendingRequests.error} />
        ) : pendingRequests.data.rows.length === 0 ? (
          <Empty title="Nothing waiting">New leave and work-from-home requests will show up here.</Empty>
        ) : (
          <ul className="grid gap-4" aria-label="Requests waiting for a decision">
            {pendingRequests.data.rows.map((r: PendingRequest) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </ul>
        ))}

      {view === "compoff" && <CompOffTab filterParam={one(raw.filter)} />}

      {view === "history" && history && (!history.ok ? <Problem message={history.error} /> : <History rows={history.data} />)}

      {view === "balances" && balances && (!balances.ok ? <Problem message={balances.error} /> : <Balances rows={balances.data.rows} quota={balances.data.quota} month={balances.data.month} />)}
    </div>
  );
}
