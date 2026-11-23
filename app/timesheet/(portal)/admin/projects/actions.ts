"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

export type ProjectResult = { ok: true; message: string } | { ok: false; error: string };

// Admin only: the role is checked here and again inside each database function, which also writes the change to the audit log.
async function call(fn: string, args: Record<string, unknown>, done: string): Promise<ProjectResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (me.role !== "admin") return { ok: false, error: "Only admins can do that." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    logError(`projects: ${fn}`, error);
    const missing = ["42883", "PGRST202"].includes(error.code ?? "");
    return { ok: false, error: error.code === "P0001" ? error.message : missing ? "Projects aren't set up yet. Run supabase/step31_projects.sql in Supabase." : "Something went wrong. Please try again." };
  }
  for (const path of ["/timesheet/admin/projects", "/timesheet/admin/audit", "/timesheet/worklog", "/timesheet/dashboard"]) revalidatePath(path);
  return { ok: true, message: done };
}

export async function addProjectAction(name: string, category: string): Promise<ProjectResult> {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return { ok: false, error: "Enter the project's name." };
  const cat = category === "client" || category === "internal" ? category : "other";
  return call("project_add", { p_name: n, p_category: cat }, `Added ${n}.`);
}

export async function setProjectCategoryAction(id: string, category: string): Promise<ProjectResult> {
  if (!isUuid(id)) return { ok: false, error: "That project could not be found." };
  if (category !== "client" && category !== "internal" && category !== "other") return { ok: false, error: "Choose client work, internal or other." };
  return call("project_set_category", { p_id: id, p_category: category }, "Moved.");
}

export async function renameProjectAction(id: string, name: string): Promise<ProjectResult> {
  if (!isUuid(id)) return { ok: false, error: "That project could not be found." };
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return { ok: false, error: "Enter the project's name." };
  return call("project_rename", { p_id: id, p_name: n }, `Renamed to ${n}.`);
}

export async function setProjectActiveAction(id: string, active: boolean): Promise<ProjectResult> {
  if (!isUuid(id)) return { ok: false, error: "That project could not be found." };
  return call("project_set_active", { p_id: id, p_active: active === true }, active ? "Project restored." : "Project archived.");
}
