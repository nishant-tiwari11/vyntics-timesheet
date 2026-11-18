"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

export type DocActionResult = { ok: true; message?: string } | { ok: false; error: string };

// Admin-only document actions. Each one checks the role here and the database function checks it again.
async function admin(): Promise<string | null> {
  const me = await getCurrentUser();
  if (!me) return "Please sign in again.";
  if (me.role !== "admin") return "Only admins can do that.";
  return null;
}

async function call(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    logError(fn, error);
    return { ok: false, error: error.code === "P0001" ? error.message : "Something went wrong. Please try again." };
  }
  return { ok: true, data };
}

/** Make a document visible to the employee, or HR only (all its versions). */
export async function setVisibilityAction(id: string, visibility: "employee" | "hr_only"): Promise<DocActionResult> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id) || (visibility !== "employee" && visibility !== "hr_only")) return { ok: false, error: "That document could not be found." };
  const res = await call("doc_set_visibility", { p_id: id, p_visibility: visibility });
  if (!res.ok) return res;
  revalidatePath("/timesheet/profile");
  revalidatePath("/timesheet/admin/documents");
  return { ok: true, message: visibility === "hr_only" ? "Now HR only." : "Now visible to the employee." };
}

/** Send an employee an in-app reminder about their missing required documents (once a day per person). */
export async function sendReminderAction(userId: string): Promise<DocActionResult> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(userId)) return { ok: false, error: "That person could not be found." };
  const res = await call("docs_send_reminder", { p_user: userId });
  if (!res.ok) return res;
  return res.data === false ? { ok: true, message: "They were already reminded today." } : { ok: true, message: "Reminder sent." };
}

/** Let a manager see their team's ID, bank and salary documents (or take that away). */
export async function setManagerSensitiveAction(userId: string, allowed: boolean): Promise<DocActionResult> {
  const denied = await admin();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(userId)) return { ok: false, error: "That person could not be found." };
  const res = await call("doc_set_manager_sensitive", { p_user: userId, p_allowed: allowed === true });
  if (!res.ok) return res;
  revalidatePath("/timesheet/admin/documents");
  return { ok: true, message: allowed ? "This manager can now see sensitive documents." : "This manager can no longer see sensitive documents." };
}
