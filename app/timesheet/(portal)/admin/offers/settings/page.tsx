import "../../../dashboard/dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signingImageStatus } from "@/lib/documents/signingAssets";
import { loadOfferSettings } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { OfferSettingsForm } from "./OfferSettingsForm";

export const metadata = { title: "Offer letter settings (admin)" };
export const dynamic = "force-dynamic";

// Set once: the company details on every letter, the logo, signature and seal, and the wording of each clause. Admin only.
export default async function OfferSettingsPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const [settings, pictures] = await Promise.all([loadOfferSettings(), signingImageStatus().catch(() => ({ signature: false, seal: false, logo: false }))]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href="/timesheet/admin/offers" className="ts-link w-fit text-sm">
          ← All offer letters
        </Link>
        <h1 className="ts-h1">Offer letter settings</h1>
        <p className="ts-muted">The company details, pictures and wording used by every offer letter. Which clauses appear for each type of letter is fixed, so a typo here can&apos;t remove one.</p>
      </div>
      {!settings.ready && (
        <p role="note" className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Not set up yet. Run <code>supabase/step41_offer_letters.sql</code> in Supabase, then reload this page.
        </p>
      )}
      <OfferSettingsForm saved={{ company: settings.company, clauses: settings.clauses }} ready={settings.ready} pictures={pictures} />
    </div>
  );
}
