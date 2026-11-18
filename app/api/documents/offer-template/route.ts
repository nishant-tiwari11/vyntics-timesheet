import { NextResponse, type NextRequest } from "next/server";
import { checkTemplate } from "@/lib/documents/offerLetter";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: { ok: boolean; error?: string }, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

// PUT /api/documents/offer-template   { body: string }
// Admins only. Saves the offer letter wording after checking it (known {{details}}, balanced [[ ]], a sensible length).
// The database policy checks the role again.
export async function PUT(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return reply({ ok: false, error: "Please sign in again." }, 401);
  if (me.role !== "admin") return reply({ ok: false, error: "Only admins can do that." }, 403);

  const json = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const checked = checkTemplate(json?.body);
  if (!checked.ok) return reply({ ok: false, error: checked.error }, 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_templates" as never)
    .upsert({ id: "offer_letter", body: checked.data, updated_by: me.id, updated_at: new Date().toISOString() } as never, { onConflict: "id" });
  if (error) {
    logError("offer template save", error);
    const missing = ["42P01", "PGRST205"].includes(error.code ?? "");
    return reply({ ok: false, error: missing ? "Saving isn't set up yet. Run supabase/step28_document_templates.sql in Supabase." : "Couldn't save the template. Please try again." }, 500);
  }
  return reply({ ok: true });
}
