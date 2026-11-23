import { redirect } from "next/navigation";
import { getAccessBlock, getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getOnboardingGate } from "@/lib/onboarding/server";
import { loadSettings } from "@/lib/timesheet/settingsServer";
import { SettingsProvider } from "../_components/SettingsProvider";
import Shell from "../_components/Shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Still signed in but no longer allowed (disabled, expired, or signed in too long ago): end the session.
  const block = await getAccessBlock();
  if (block) redirect(`/timesheet/auth/signout?reason=${block}`);
  const user = await getCurrentUser();
  if (!user) redirect("/timesheet/login");

  const [settings, gate] = await Promise.all([loadSettings(), getOnboardingGate()]);
  // New employees finish onboarding (documents, bank details) before the portal opens.
  if (gate.locked) redirect("/timesheet/onboarding");

  return (
    <>
      {/* First, so the browser pieces below know the weekly off days, the daily target and the lock before they draw. */}
      <SettingsProvider settings={settings} />
      <Shell id={user.id} email={user.email} name={user.name} role={user.role} rejectedDocs={gate.rejected}>
        {children}
      </Shell>
    </>
  );
}
