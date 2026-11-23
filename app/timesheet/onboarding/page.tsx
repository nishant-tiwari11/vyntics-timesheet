import Image from "next/image";
import { redirect } from "next/navigation";
import { getAccessBlock, getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { loadMyOnboarding, mustOnboard } from "@/lib/onboarding/server";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { signOut } from "../actions";
import logo from "../login/vyntics-logo.png";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

// The first thing a new employee sees: a short checklist (degree, Aadhaar, bank details, experience, photo) that has to be
// finished before the portal opens. It lives outside the portal layout, which sends people here until they have submitted.
export default async function OnboardingPage() {
  const block = await getAccessBlock();
  if (block) redirect(`/timesheet/auth/signout?reason=${block}`);
  const me = await getCurrentUser();
  if (!me) redirect("/timesheet/login");
  if (!mustOnboard(me.role)) redirect("/timesheet");

  let data;
  try {
    data = await loadMyOnboarding();
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("onboarding page", e);
    return (
      <main className="mx-auto grid max-w-xl gap-3 p-6">
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {e instanceof TimesheetError ? e.message : "Something went wrong. Please refresh the page."}
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <Image src={logo} alt="" width={30} height={30} priority />
            Vyntics
          </span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {data.ready ? (
          <OnboardingWizard name={me.name || me.email} email={me.email} initial={data} />
        ) : (
          <p role="note" className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Onboarding isn&apos;t set up yet. Ask your admin to run <code>supabase/step35_onboarding.sql</code>.
          </p>
        )}
      </main>
    </div>
  );
}
