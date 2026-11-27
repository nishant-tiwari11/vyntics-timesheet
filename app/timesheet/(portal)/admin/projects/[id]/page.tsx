import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { formatYmd } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { CATEGORY_LABEL } from "@/lib/timesheet/projectCategories";
import { listProjectEntries } from "@/lib/timesheet/projectEntries";
import { listProjects } from "@/lib/timesheet/projectList";
import { UserAvatar } from "../../../../_components/UserAvatar";
import { todayInOffice } from "@/lib/timesheet/dates";
import { listBoard } from "@/lib/tickets/server";
import type { BoardCard } from "@/lib/tickets/board";
import { isOverdue } from "@/lib/tickets/model";
import { Button } from "@/components/ui/button";
import { Kanban } from "lucide-react";

export const metadata = { title: "Project entries" };
export const dynamic = "force-dynamic";

// Every work log entry for one project, by every employee, with the hours per person. Admin only.
export default async function ProjectEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = (await listProjects()).find((p) => p.id === id);
  if (!project) notFound();

  let data: Awaited<ReturnType<typeof listProjectEntries>> | null = null;
  let error: string | null = null;
  try {
    data = await listProjectEntries(project.name);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("project entries", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }
  const hours = data ? Math.round(data.people.reduce((n, p) => n + p.hours, 0) * 100) / 100 : 0;

  // A few numbers about the project's tickets for the button. If tickets aren't set up yet (step 45), the rest of the page still works.
  let tickets: BoardCard[] | null = null;
  try {
    tickets = await listBoard(project.name);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("project tickets", e);
  }
  const today = todayInOffice();
  const open = tickets?.filter((t) => t.status !== "resolved" && t.status !== "closed").length ?? 0;
  const overdue = tickets?.filter((t) => isOverdue(t.dueOn, t.status, today)).length ?? 0;

  return (
    <div className="ts-page grid gap-5">
      <div className="grid gap-1">
        <Link href="/timesheet/admin/projects" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Projects
        </Link>
        <h1 className="ts-h1">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {CATEGORY_LABEL[project.category]}
          {project.active ? "" : " · Archived"} · every work log entry for this project
        </p>
      </div>

      {error || !data ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Couldn't load the entries."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-3" aria-label="Summary">
            {[
              ["Entries", String(data.total)],
              ["Hours", String(hours)],
              ["People", String(data.people.length)],
            ].map(([label, value]) => (
              <li key={label} className="rounded-xl border bg-card p-4">
                <span className="block text-sm text-muted-foreground">{label}</span>
                <span className="mt-1 block text-3xl font-semibold tabular-nums">{value}</span>
              </li>
            ))}
          </ul>

          {data.people.length > 0 && (
            <section className="grid gap-2 rounded-xl border bg-card p-4" aria-label="Hours by person">
              <h2 className="text-base font-semibold">By person</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.people.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <Link href={`/timesheet/admin/access/${p.userId}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                      <UserAvatar userId={p.userId} name={p.person} className="size-7 text-xs" />
                      <span className="truncate">{p.person}</span>
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {p.entries} {p.entries === 1 ? "entry" : "entries"} · {p.hours} h
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tickets && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4" aria-label="Tickets for this project">
              <div className="grid gap-0.5">
                <h2 className="text-base font-semibold">Tickets</h2>
                <p className="text-sm text-muted-foreground">
                  {tickets.length === 0 ? "No tickets about this project yet." : `${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"} · ${open} open${overdue > 0 ? ` · ${overdue} overdue` : ""}`}
                </p>
              </div>
              <Button asChild>
                <Link href={`/timesheet/admin/projects/${project.id}/tickets`}>
                  <Kanban aria-hidden="true" /> Open ticket dashboard
                </Link>
              </Button>
            </section>
          )}

          {data.entries.length === 0 ? (
            <div className="ts-card ts-empty">
              <strong>No entries yet</strong>
              <p>Nobody has logged time to this project.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {data.truncated && <p className="text-sm text-muted-foreground">Showing the latest {data.entries.length} of {data.total} entries.</p>}
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <caption className="sr-only">Work log entries for {project.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>What they did</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.entries.map((e) => (
                      <TableRow key={e.id} className={e.status === "rejected" ? "text-muted-foreground line-through" : ""}>
                        <TableCell className="whitespace-nowrap">{formatYmd(e.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</TableCell>
                        <TableCell className="min-w-36 font-medium">{e.person}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{e.start && e.end ? `${e.start} to ${e.end}` : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.hours}</TableCell>
                        <TableCell className="max-w-96 break-words whitespace-normal">{e.text}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
