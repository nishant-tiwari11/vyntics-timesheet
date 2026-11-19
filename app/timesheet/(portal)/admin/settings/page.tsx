import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getSettings as getCompOffSettings } from "@/lib/timesheet/compOff";
import { DEFAULT_SETTINGS as COMP_OFF_DEFAULTS, type CompOffSettings } from "@/lib/timesheet/compOffCore";
import { todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { forgetSettings, loadSettings } from "@/lib/timesheet/settingsServer";
import { CompOffSettingsForm } from "../CompOffControls";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings (admin)" };

// The rules an admin can change for everyone: the daily target, the weekly off days, the timesheet lock, and the comp-off rules.
// Admin only.
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  forgetSettings(); // show what is really saved, not a copy kept for a few seconds
  const saved = await loadSettings();
  let compOff: CompOffSettings = COMP_OFF_DEFAULTS;
  try {
    compOff = await getCompOffSettings();
  } catch (e) {
    logError("admin settings: comp-off", e);
  }

  return (
    <>
      <div className="grid gap-1">
        <h1 className="ts-h1">Settings</h1>
        <p className="ts-muted">Rules that apply to everyone. Changes take effect straight away and are recorded in the Audit Log.</p>
      </div>

      <SettingsForm saved={saved} today={todayInOffice()} />

      <section aria-labelledby="comp-off-rules" className="rounded-xl border bg-card p-5">
        <h2 id="comp-off-rules" className="mb-1 text-base font-semibold">
          Comp-off
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">How much comp-off is earned, how long it lasts, and the most one person can earn in a month.</p>
        <CompOffSettingsForm settings={compOff} />
      </section>
    </>
  );
}
