import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { listProjects } from "@/lib/timesheet/projectList";
import type { BoardCard } from "@/lib/tickets/board";
import { assignablePeople, listBoard, listCategories, type Category } from "@/lib/tickets/server";
import ProjectBoard from "../../../../tickets/ProjectBoard";

export const metadata = { title: "Ticket dashboard" };
export const dynamic = "force-dynamic";

// The ticket dashboard of one project (like a GitHub project): a slim header with the way back, then the board filling the rest of
// the space beside the side menu. The columns share the width and scroll inside, so the page itself never scrolls. Admin only.
export default async function ProjectTicketsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = (await listProjects()).find((p) => p.id === id);
  if (!project) notFound();

  let board: BoardCard[] | null = null;
  let categories: Category[] = [];
  let people: { id: string; name: string }[] = [];
  let error: string | null = null;
  try {
    [board, categories, people] = await Promise.all([listBoard(project.name), listCategories(), assignablePeople()]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("project tickets", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <div className="ts-fullbleed">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5">
        <Link href={`/timesheet/admin/projects/${project.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-accent">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to project
        </Link>
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{project.name}</h1>
        <span className="text-sm text-muted-foreground">Ticket dashboard</span>
      </header>
      <main className="min-h-0 flex-1 p-3">
        {board ? (
          <ProjectBoard project={project.name} initial={board} categories={categories} people={people} who={{ id: me.id, name: me.name, email: me.email }} today={todayInOffice()} canMove canRaise fill />
        ) : (
          <p role="alert" className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
