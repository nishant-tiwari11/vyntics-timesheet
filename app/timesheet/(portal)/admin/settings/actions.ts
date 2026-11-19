"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { isYmd, todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { applySettings } from "@/lib/timesheet/settings";
import { forgetSettings } from "@/lib/timesheet/settingsServer";

export type SettingsResult = { ok: true } | { ok: false; error: string };

export type SettingsInput = { dailyTargetHours: number; weeklyOffDays: number[]; lockedThrough: string | null };

/** Admin only. The role is checked here and again inside the database function, which also writes what changed to the audit log. */
export async function saveSettingsAction(input: SettingsInput): Promise<SettingsResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  if (me.role !== "admin") return { ok: false, error: "Only admins can do that." };

  const target = Number(input?.dailyTargetHours);
  if (!Number.isFinite(target) || target <= 0 || target > 24) return { ok: false, error: "The daily target must be more than 0 and at most 24 hours." };
  const days = Array.isArray(input?.weeklyOffDays) ? [...new Set(input.weeklyOffDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [];
  if (days.length > 6) return { ok: false, error: "At least one day of the week must be a working day." };
  const locked = input?.lockedThrough ?? null;
  if (locked !== null && !isYmd(locked)) return { ok: false, error: "Enter a valid lock date." };
  if (locked !== null && locked > todayInOffice()) return { ok: false, error: "The lock date can't be in the future." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("settings_update" as never, { p_target: target, p_off: days, p_locked: locked } as never);
  if (error) {
    logError("settings", error);
    const missing = ["42883", "PGRST202"].includes(error.code ?? "");
    return { ok: false, error: error.code === "P0001" ? error.message : missing ? "Settings aren't set up yet. Run supabase/step32_settings.sql in Supabase." : "Something went wrong. Please try again." };
  }

  // Use the new settings straight away on this server, and make every page draw again with them.
  forgetSettings();
  applySettings({ dailyTargetHours: target, weeklyOffDays: days, lockedThrough: locked });
  revalidatePath("/timesheet", "layout");
  return { ok: true };
}
