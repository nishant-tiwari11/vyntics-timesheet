import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSettings, listMine, myBalance } from "@/lib/timesheet/compOff";
import { daysText, type CompOffRequest } from "@/lib/timesheet/compOffCore";
import { addDays, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { logError } from "@/lib/timesheet/log";
import { SectionError } from "../dashboard/sections";
import { CancelCompOff, EarnCompOffButton } from "./CompOffControls";

export const STATUS_TEXT = { pending: "○ Pending", approved: "✓ Approved", rejected: "✕ Rejected", cancelled: "Cancelled" } as const;

// "Comp-off" on the Leave & WFH page: your balance, a form to earn more, and the history of your requests.
export default async function CompOffSection() {
  const today = todayInOffice();
  let error: string | null = null;
  let loaded: { balance: Awaited<ReturnType<typeof myBalance>>; settings: Awaited<ReturnType<typeof getSettings>>; history: CompOffRequest[]; off: string[] } | null = null;
  try {
    const [balance, settings, history, off] = await Promise.all([
      myBalance(),
      getSettings(),
      listMine(),
      offDatesBetween(addDays(today, -400), today).catch(() => [] as string[]),
    ]);
    loaded = { balance, settings, history, off };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("comp-off", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <section className="ts-card" id="comp-off" aria-labelledby="comp-off-title">
      <div className="ts-section-head">
        <h2 className="ts-h2" id="comp-off-title">
          Comp-off
        </h2>
        {loaded && <EarnCompOffButton today={today} settings={loaded.settings} offDays={loaded.off} />}
      </div>

      {error || !loaded ? (
        <SectionError message={error ?? "Couldn't load comp-off."} />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Available", daysText(loaded.balance.available)],
              ["Expiring soon", daysText(loaded.balance.expiringSoon)],
              ["Earned", daysText(loaded.balance.earned)],
              ["Used", daysText(loaded.balance.used)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-4 text-sm text-muted-foreground">
            Work on a weekend, a public holiday or a festival creates a comp-off request automatically from your time log. You can also ask yourself with Earn comp-off. Credits expire {loaded.settings.expiryDays} days after approval. Use them from the
            leave form above by choosing Comp-off.
          </p>

          {loaded.history.length === 0 ? (
            <div className="ts-empty">
              <strong>No comp-off requests yet</strong>
              <p>If you work on a weekend or a holiday, use Earn comp-off to ask for a day back.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Your comp-off requests, newest first</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day worked</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loaded.history.map((r) => {
                    const when = formatYmd(r.workDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{when}</TableCell>
                        <TableCell className="tabular-nums">{r.hours} h</TableCell>
                        <TableCell className="tabular-nums">
                          {daysText(r.credit)}
                          {r.needsReapproval && r.proposedCredit != null && <div className="text-xs text-muted-foreground">now {daysText(r.proposedCredit)}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {r.expiresOn ? formatYmd(r.expiresOn, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.status === "pending" || r.needsReapproval ? "border-dashed" : ""}>
                            {r.needsReapproval ? "○ Re-approval pending" : STATUS_TEXT[r.status]}
                          </Badge>
                          {r.auto && <div className="mt-1 text-xs text-muted-foreground">Created from your timesheet</div>}
                          {r.adminNote && <div className="mt-1 text-xs text-muted-foreground">{r.adminNote}</div>}
                        </TableCell>
                        <TableCell className="text-right">{r.status === "pending" && <CancelCompOff id={r.id} label={when} />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
