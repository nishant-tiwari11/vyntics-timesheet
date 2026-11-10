import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { audit, getPayrollSettings, listAudit, listComponents } from "@/lib/payroll/server";
import type { AuditRow, ComponentRow, PayrollSettingsData } from "@/lib/payroll/types";
import { formatInstantDate, formatTime } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { ComponentsTable, SettingsForm } from "./SettingsControls";

export const metadata = { title: "Payroll · Settings" };
export const dynamic = "force-dynamic";

const ACTION_TEXT: Record<string, string> = {
  viewed: "Viewed",
  viewed_history: "Opened salary history",
  structure_added: "Added a salary structure",
  details_saved: "Changed employee details",
  settings_saved: "Changed payroll settings",
  component_saved: "Changed a pay component",
  component_added: "Added a pay component",
  component_deleted: "Deleted a pay component",
};

export default async function PayrollSettingsPage() {
  let settings: PayrollSettingsData | null = null;
  let components: ComponentRow[] = [];
  let activity: AuditRow[] = [];
  let error: string | null = null;
  try {
    [settings, components, activity] = await Promise.all([getPayrollSettings(), listComponents(), listAudit(20)]);
    await audit("viewed", "payroll_settings", undefined, "Opened the payroll settings");
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("payroll-settings", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  if (error || !settings) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        {error ?? "Couldn't load the payroll settings."}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div role="note" className="rounded-lg border border-dashed p-4 text-sm">
        <strong>Rates are not built in.</strong> Provident fund, ESI, professional tax and TDS start switched off with zero values. Enter each rate and
        slab from the official rules yourself, and have an accountant verify everything before you run payroll.
      </div>

      <section aria-labelledby="rules-title" className="grid gap-4">
        <h2 id="rules-title" className="text-base font-semibold">
          Pay month and rules
        </h2>
        <div className="ts-card">
          <SettingsForm settings={settings} />
        </div>
        {settings.paidLeavePerMonth === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            Paid leave per month is 0, so every approved leave day will count as loss of pay until you enter your leave policy.
          </p>
        )}
      </section>

      <section aria-labelledby="components-title" className="grid gap-4">
        <h2 id="components-title" className="text-base font-semibold">
          Pay components
        </h2>
        <ComponentsTable components={components} currency={settings.currency} />
      </section>

      <section aria-labelledby="activity-title" className="grid gap-4">
        <h2 id="activity-title" className="text-base font-semibold">
          Recent payroll activity
        </h2>
        {activity.length === 0 ? (
          <div className="ts-card ts-empty">
            <strong>No activity yet</strong>
            <p>Every view and change of payroll data is recorded here with who did it and when.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Recent payroll activity</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatInstantDate(a.at)} · {formatTime(a.at)}
                    </TableCell>
                    <TableCell>{a.actor}</TableCell>
                    <TableCell className="whitespace-normal">
                      {ACTION_TEXT[a.action] ?? a.action}
                      {a.detail && <span className="text-muted-foreground"> · {a.detail}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
