import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logError } from "./log";
import { DEFAULT_SETTINGS, applySettings, cleanSettings, type PortalSettings } from "./settings";

// Reading the settings an admin chose (supabase/step32_settings.sql). They are the same for everyone, so one copy is kept for 30
// seconds instead of asking the database on every request. Before that step has been run, or if the table can't be read, the
// defaults are used (Saturday and Sunday off, an 8 hour day, no admin lock) so nothing stops working.

const TTL_MS = 30_000;
let cached: { at: number; value: PortalSettings } | null = null;

export async function loadSettings(): Promise<PortalSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = cached?.value ?? DEFAULT_SETTINGS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings" as never).select("daily_target_hours, weekly_off_days, locked_through").eq("id", true).maybeSingle();
    if (error) {
      if (!["42P01", "PGRST205"].includes((error as { code?: string }).code ?? "")) logError("settings", error);
      value = DEFAULT_SETTINGS;
    } else if (data) {
      const row = data as unknown as { daily_target_hours: number | string; weekly_off_days: number[]; locked_through: string | null };
      value = cleanSettings({ dailyTargetHours: row.daily_target_hours, weeklyOffDays: row.weekly_off_days, lockedThrough: row.locked_through });
    } else {
      value = DEFAULT_SETTINGS;
    }
  } catch (e) {
    // Next.js uses thrown errors to say "this page is dynamic" or "redirect"; those must pass through, not be treated as a failure.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE" || digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING")) throw e;
    logError("settings", e);
  }
  cached = { at: Date.now(), value };
  return value;
}

/** Make the current settings the ones the weekday, target and lock checks use on this server. */
export async function primeSettings(): Promise<PortalSettings> {
  const value = await loadSettings();
  applySettings(value);
  return value;
}

/** Forget what was read, so the next request reads the saved settings (after an admin changes them). */
export function forgetSettings(): void {
  cached = null;
}
