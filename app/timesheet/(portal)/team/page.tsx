import Link from "next/link";
import { redirect } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadTeam } from "@/lib/access/team";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

// Read-only look at the people who report to you (or, for an admin, everyone): hours this week and what is waiting.
export default async function TeamPage() {
  const me = await getCurrentUser();
  if (me?.role !== "manager" && me?.role !== "admin") redirect("/timesheet/dashboard");

  let data: Awaited<ReturnType<typeof loadTeam>> | null = null;
  let error: string | null = null;
  try {
    data = await loadTeam();
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("team-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          {data?.scope === "everyone" ? "Everyone with an account. Hours are for the last 7 days." : "The people who report to you. Hours are for the last 7 days. This page is read-only."}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {data?.needsSetup && (
        <p className="rounded-lg border border-dashed p-4 text-sm" role="note">
          Teams aren&apos;t set up yet. An admin needs to run <code>supabase/step24_access.sql</code>.
        </p>
      )}

      {data && !data.needsSetup && data.members.length === 0 && (
        <div className="ts-card ts-empty">
          <strong>No one reports to you yet</strong>
          <p>
            An admin sets each person&apos;s manager under{" "}
            <Link href="/timesheet/admin/access" className="underline underline-offset-4">
              Admin → Access
            </Link>
            .
          </p>
        </div>
      )}

      {data && data.members.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Team members</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hours, last 7 days</TableHead>
                <TableHead className="text-right">Logs waiting</TableHead>
                <TableHead className="text-right">Leave/WFH waiting</TableHead>
                <TableHead className="text-right">Expenses waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs break-all text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>{m.roleLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.hoursThisWeek}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.pendingLogs}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.openRequests}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.pendingExpenses}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
