import { redirect } from "next/navigation";
import { isUuid } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { listProjects } from "@/lib/timesheet/projectList";
import { logError } from "@/lib/timesheet/log";
import { ProjectsManager, type ProjectView } from "./ProjectsManager";

export const metadata = { title: "Projects (admin)" };

type Usage = { name: string; entries: number; hours: number; last_used: string | null };

// The projects people can log time against: add, rename (while unused) and archive. Admin only.
export default async function ProjectsPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  const rows = await listProjects();
  // Until step31_projects.sql has been run the list is the built-in names with no real ids, and nothing can be changed.
  const ready = rows.length > 0 && rows.every((p) => isUuid(p.id));

  const usage = new Map<string, Usage>();
  if (ready) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("project_usage" as never);
      if (error) throw error;
      for (const u of (data ?? []) as unknown as Usage[]) usage.set(u.name, { name: u.name, entries: Number(u.entries) || 0, hours: Math.round((Number(u.hours) || 0) * 100) / 100, last_used: u.last_used });
    } catch (e) {
      logError("projects usage", e);
    }
  }

  const projects: ProjectView[] = rows.map((p) => {
    const u = usage.get(p.name);
    return { id: p.id, name: p.name, active: p.active, entries: u?.entries ?? 0, hours: u?.hours ?? 0, lastUsed: u?.last_used ?? "" };
  });

  return (
    <>
      <div className="grid gap-1">
        <h1 className="ts-h1">Projects</h1>
        <p className="ts-muted">What people can log time against.</p>
      </div>
      {ready ? (
        <ProjectsManager projects={projects} />
      ) : (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Projects aren&apos;t set up yet, so time logs use the five built-in projects ({rows.map((p) => p.name).join(", ")}). Run <code>supabase/step31_projects.sql</code> in Supabase to manage them here.
        </p>
      )}
    </>
  );
}
