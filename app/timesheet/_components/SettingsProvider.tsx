"use client";

import { applySettings, type PortalSettings } from "@/lib/timesheet/settings";

// Gives the browser (and the server-side render of the browser components) the same settings the server uses: which days are the
// weekly off, the daily target and the admin lock. It must come before everything that uses them, so the portal layout puts it first.
// It writes to a shared copy while rendering; that is safe because the settings are the same for everyone and the same
// values are written every time until an admin saves new ones.
export function SettingsProvider({ settings }: { settings: PortalSettings }) {
  applySettings(settings);
  return null;
}
