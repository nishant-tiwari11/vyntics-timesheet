import "../../../dashboard/dashboard.css";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/avatar";
import { newLetter } from "@/lib/offers/defaults";
import { loadOfferSettings } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { todayInOffice } from "@/lib/timesheet/dates";
import { OfferEditor } from "../OfferEditor";

export const metadata = { title: "New offer letter (admin)" };
export const dynamic = "force-dynamic";

// A new letter for one person: their name and email are filled in from their record, and the form starts as a phased internship.
export default async function NewOfferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const raw = await searchParams;
  const userId = Array.isArray(raw.user) ? raw.user[0] : raw.user;
  if (!isUuid(userId)) redirect("/timesheet/admin/offers");

  const supabase = await createClient();
  const { data: person } = await supabase.from("profiles").select("full_name, email, manager_id").eq("id", userId).maybeSingle();
  if (!person) notFound();
  const manager = person.manager_id ? (await supabase.from("profiles").select("full_name, email").eq("id", person.manager_id).maybeSingle()).data : null;
  const settings = await loadOfferSettings();
  const name = person.full_name?.trim() || person.email.split("@")[0];

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href="/timesheet/admin/offers" className="ts-link w-fit text-sm">
          ← All offer letters
        </Link>
        <h1 className="ts-h1">New offer letter</h1>
        <p className="ts-muted">For {name}. Choose the type, fill in the details and check the preview. Nothing is sent until you click Send.</p>
      </div>
      {!settings.ready && (
        <p role="note" className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Offer letters aren&apos;t set up yet. Run <code>supabase/step41_offer_letters.sql</code> in Supabase before saving.
        </p>
      )}
      <OfferEditor
        letter={{ id: null, userId, status: "draft", version: 1, isCurrent: true }}
        initial={newLetter(todayInOffice(), { name, email: person.email, manager: manager ? manager.full_name?.trim() || manager.email.split("@")[0] : "" })}
        company={settings.company}
        clauses={settings.clauses}
        logoUrl="/api/offers/asset?kind=logo" signatureUrl="/api/offers/asset?kind=signature" sealUrl="/api/offers/asset?kind=seal"
      />
    </div>
  );
}
