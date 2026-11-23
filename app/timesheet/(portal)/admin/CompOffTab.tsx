import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSettings, listAll } from "@/lib/timesheet/compOff";
import { daysText, type CompOffRequest, type CompOffSettings } from "@/lib/timesheet/compOffCore";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { SectionError } from "../dashboard/sections";
import { DecideCompOff, EditRulesButton } from "./CompOffControls";

const BASE = "/timesheet/admin/approvals?view=compoff";
const STATUS = { pending: "○ Pending", approved: "✓ Approved", rejected: "✕ Rejected", cancelled: "Cancelled" } as const;

async function load<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin-comp-off", e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}

const pill = (active: boolean) =>
  cn("inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent", active && "border-primary bg-primary text-primary-foreground hover:bg-primary");

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export async function CompOffTab({ filterParam }: { filterParam?: string }) {
  const filter = filterParam === "all" ? "all" : "pending";
  const [requests, settings] = await Promise.all([load(() => listAll(filter)), load(getSettings)]);

  return (
    <div className="grid gap-8">
      {/* Requests */}
      <section aria-label="Comp-off requests">
        <Heading title="Comp-off credit requests">
          <nav aria-label="Filter requests" className="flex flex-wrap items-center gap-1.5">
            {settings.ok && <EditRulesButton settings={settings.data as CompOffSettings} />}
            <Link href={BASE} aria-current={filter === "pending" ? "page" : undefined} className={pill(filter === "pending")}>
              Waiting
            </Link>
            <Link href={`${BASE}&filter=all`} aria-current={filter === "all" ? "page" : undefined} className={pill(filter === "all")}>
              All
            </Link>
          </nav>
        </Heading>
        {!requests.ok ? (
          <SectionError message={requests.error} />
        ) : requests.data.length === 0 ? (
          <div className="ts-card ts-empty">
            <strong>{filter === "pending" ? "Nothing is waiting for a decision" : "No comp-off requests yet"}</strong>
            <p>Credit requests appear here when employees work on a weekend or holiday.</p>
          </div>
        ) : (
          <RequestsTable rows={requests.data} />
        )}
      </section>
    </div>
  );
}

function RequestsTable({ rows }: { rows: CompOffRequest[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <caption className="sr-only">Comp-off requests</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Day worked</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Credit</TableHead>
            <TableHead>Timesheet entry</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const day = formatYmd(r.workDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="whitespace-nowrap">{day}</TableCell>
                <TableCell className="tabular-nums">{r.hours} h</TableCell>
                <TableCell className="tabular-nums">
                  {daysText(r.credit)}
                  {r.needsReapproval && r.proposedCredit != null && (
                    <div className="text-xs text-muted-foreground">
                      now {daysText(r.proposedCredit)} ({r.proposedHours ?? 0} h)
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-48 max-w-72 whitespace-normal break-words">
                  {r.entry ? (
                    <>
                      <div className="line-clamp-2">{r.entry.task}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatYmd(r.workDate, { day: "numeric", month: "short" })}
                        {r.entry.hours != null ? ` · ${r.entry.hours} h` : ""}
                        {r.entry.project ? ` · ${r.entry.project}` : ""}
                        {r.auto ? " · from the timesheet" : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{r.reason || "No linked entry"}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.status === "pending" || r.needsReapproval ? "border-dashed" : ""}>
                    {r.needsReapproval ? "○ Re-approval needed" : STATUS[r.status]}
                  </Badge>
                  {r.adminNote && <div className="mt-1 text-xs text-muted-foreground">{r.adminNote}</div>}
                </TableCell>
                <TableCell>{(r.status === "pending" || r.needsReapproval) && <DecideCompOff id={r.id} who={r.name} day={day} reapproval={r.needsReapproval} />}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
