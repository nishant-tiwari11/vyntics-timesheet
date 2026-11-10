import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSettings, listAll, report, type CompOffReportRow } from "@/lib/timesheet/compOff";
import { daysText, type CompOffRequest, type CompOffSettings } from "@/lib/timesheet/compOffCore";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { SectionError } from "../dashboard/sections";
import { CompOffSettingsForm, DecideCompOff, ExportReport } from "./CompOffControls";

const BASE = "/timesheet/admin?tab=compoff";
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
  const [requests, settings, rep] = await Promise.all([load(() => listAll(filter)), load(getSettings), load(report)]);

  return (
    <div className="grid gap-8">
      {/* Requests */}
      <section aria-label="Comp-off requests">
        <Heading title="Comp-off requests">
          <nav aria-label="Filter requests" className="flex gap-1.5">
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
            <p>Requests appear here when employees ask for comp-off for weekend or holiday work.</p>
          </div>
        ) : (
          <RequestsTable rows={requests.data} />
        )}
      </section>

      {/* Rules */}
      <section aria-label="Comp-off rules">
        <Heading title="Rules" />
        <div className="ts-card">{!settings.ok ? <SectionError message={settings.error} /> : <CompOffSettingsForm settings={settings.data as CompOffSettings} />}</div>
      </section>

      {/* Report */}
      <section aria-label="Comp-off report">
        <Heading title="Report">{rep.ok && <ExportReport rows={rep.data} />}</Heading>
        {!rep.ok ? (
          <SectionError message={rep.error} />
        ) : rep.data.length === 0 ? (
          <div className="ts-card ts-empty">
            <strong>No comp-off balances yet</strong>
            <p>Earned, used and expiring comp-off per employee will show here once requests are approved.</p>
          </div>
        ) : (
          <ReportTable rows={rep.data} />
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

function ReportTable({ rows }: { rows: CompOffReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <caption className="sr-only">Comp-off earned, used and expiring per employee</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Earned</TableHead>
            <TableHead className="text-right">Used</TableHead>
            <TableHead className="text-right">Expired</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="text-right">Expiring in 14 days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.earned}</TableCell>
              <TableCell className="text-right tabular-nums">{r.used}</TableCell>
              <TableCell className="text-right tabular-nums">{r.expired}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{r.available}</TableCell>
              <TableCell className="text-right tabular-nums">{r.expiringSoon > 0 ? `${r.expiringSoon}` : "0"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
