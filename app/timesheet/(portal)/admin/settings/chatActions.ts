"use server";

import { revalidatePath } from "next/cache";
import { chatConfigured } from "@/lib/google-chat";
import { validateChatSettings, type ChatSettings } from "@/lib/reminders/core";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

export type ChatResult = { ok: true } | { ok: false; error: string };

/** Admin only. The role is checked here and again inside the database function, which also writes the change to the audit log. */
export async function saveChatSettingsAction(input: ChatSettings): Promise<ChatResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (me.role !== "admin") return { ok: false, error: "Only admins can do that." };

  const settings: ChatSettings = {
    enabled: input?.enabled === true,
    reminderTime: String(input?.reminderTime ?? ""),
    template: String(input?.template ?? ""),
    weeklySummary: input?.weeklySummary === true,
    approvalDigest: input?.approvalDigest === true,
  };
  const problem = validateChatSettings(settings);
  if (problem) return { ok: false, error: problem };
  if (settings.enabled && !chatConfigured()) return { ok: false, error: "Google Chat isn't connected yet: add GOOGLE_CHAT_WEBHOOK_URL on the server first." };

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "chat_settings_update" as never,
    { p_enabled: settings.enabled, p_time: settings.reminderTime, p_template: settings.template.trim(), p_summary: settings.weeklySummary, p_digest: settings.approvalDigest } as never,
  );
  if (error) {
    logError("chat settings", error);
    const missing = ["42883", "PGRST202"].includes(error.code ?? "");
    return { ok: false, error: error.code === "P0001" ? error.message : missing ? "Chat reminders aren't set up yet. Run supabase/step33_chat_reminders.sql in Supabase." : "Something went wrong. Please try again." };
  }
  revalidatePath("/timesheet/admin/settings");
  return { ok: true };
}
