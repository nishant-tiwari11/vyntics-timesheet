import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TimesheetError } from "./errors";
import { logError } from "./log";
import { PROJECTS } from "./projects";

// The projects people can log time against: the list in the database (managed on Admin -> Projects, supabase/step31_projects.sql).
// Until that step has been run, or if the list can't be read, the five built-in projects are used so time logging keeps working.

export type ProjectRow = { id: string; name: string; active: boolean };

const FALLBACK: ProjectRow[] = PROJECTS.map((name) => ({ id: name, name, active: true }));

/** Every project, active and archived, A to Z. One read per request. */
export const listProjects = cache(async (): Promise<ProjectRow[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("projects" as never).select("id, name, active").order("name");
    if (error) {
      if (!["42P01", "PGRST205"].includes((error as { code?: string }).code ?? "")) logError("projects", error);
      return FALLBACK;
    }
    const rows = ((data ?? []) as unknown as ProjectRow[]).map((p) => ({ id: p.id, name: p.name, active: !!p.active }));
    return rows.length > 0 ? rows : FALLBACK;
  } catch (e) {
    // Next.js uses thrown errors to say "this page is dynamic" or "redirect"; those must pass through, not be treated as a failure.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE" || digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING")) throw e;
    logError("projects", e);
    return FALLBACK;
  }
});

/** The names that can be chosen for a new entry. */
export const activeProjectNames = cache(async (): Promise<string[]> => (await listProjects()).filter((p) => p.active).map((p) => p.name));

/** Every name, including archived ones (for filters and reports over old time logs). */
export const allProjectNames = cache(async (): Promise<string[]> => (await listProjects()).map((p) => p.name));

/** The project's exact name if it is one that can be chosen (any capitals), otherwise a message for the person. */
export async function assertProject(value: unknown): Promise<string> {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  const found = (await listProjects()).find((p) => p.active && p.name.trim().toLowerCase() === text);
  if (!found) throw new TimesheetError("Please choose a project from the list.");
  return found.name;
}
