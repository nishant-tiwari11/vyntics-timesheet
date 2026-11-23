import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TimesheetError } from "./errors";
import { logError } from "./log";
import { CATEGORY_ORDER, toCategory, type ProjectCategory } from "./projectCategories";
import { PROJECTS } from "./projects";

// The projects people can log time against: the list in the database (managed on Admin -> Projects, supabase/step31_projects.sql).
// Until that step has been run, or if the list can't be read, the five built-in projects are used so time logging keeps working.

export type ProjectRow = { id: string; name: string; active: boolean; category: ProjectCategory };

const FALLBACK: ProjectRow[] = PROJECTS.map((name) => ({ id: name, name, active: true, category: name === "Client work" ? "client" : name === "Internal" ? "internal" : "other" }));

// The list changes only when an admin edits it, so a server keeps what it read for a short while instead of reading it on every page
// (the work log, the forms and the filters all need it). forgetProjects() clears it right after an admin changes a project.
const PROJECTS_TTL_MS = 20_000;
let remembered: { at: number; rows: ProjectRow[] } | null = null;

export function forgetProjects(): void {
  remembered = null;
}

/** Every project, active and archived, by category and then A to Z. One read per request, and one per 20 seconds per server. */
export const listProjects = cache(async (): Promise<ProjectRow[]> => {
  if (remembered && Date.now() - remembered.at < PROJECTS_TTL_MS) return remembered.rows;
  const rows = await readProjects();
  // Only a real answer from the database is kept (the built-in fallback is not, so a fixed set-up shows at once).
  if (rows !== FALLBACK) remembered = { at: Date.now(), rows };
  return rows;
});

async function readProjects(): Promise<ProjectRow[]> {
  try {
    const supabase = await createClient();
    let { data, error } = await supabase.from("projects" as never).select("id, name, active, category").order("name");
    // Before step37_project_categories.sql has been run there is no category column: read the list without it.
    if (error && (error as { code?: string }).code === "42703") ({ data, error } = await supabase.from("projects" as never).select("id, name, active").order("name"));
    if (error) {
      if (!["42P01", "PGRST205"].includes((error as { code?: string }).code ?? "")) logError("projects", error);
      return FALLBACK;
    }
    const rows = ((data ?? []) as unknown as ProjectRow[])
      .map((p) => ({ id: p.id, name: p.name, active: !!p.active, category: toCategory(p.category) }))
      // Client work first, then internal, then other; A to Z inside each. People see the list in this order.
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
    return rows.length > 0 ? rows : FALLBACK;
  } catch (e) {
    // Next.js uses thrown errors to say "this page is dynamic" or "redirect"; those must pass through, not be treated as a failure.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE" || digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING")) throw e;
    logError("projects", e);
    return FALLBACK;
  }
}

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
