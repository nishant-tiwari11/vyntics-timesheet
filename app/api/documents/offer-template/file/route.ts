import { NextResponse, type NextRequest } from "next/server";
import { DOC_BUCKET, KIND_MIME } from "@/lib/documents/config";
import { docxPlaceholders } from "@/lib/documents/docxTemplate";
import { DEFAULT_OFFER_TEMPLATE } from "@/lib/documents/offerLetter";
import { loadOfferTemplate, readTemplateFile } from "@/lib/documents/offerTemplate";
import { detectKind } from "@/lib/documents/sniff";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

// The admin's own Word offer-letter template.
//   POST   multipart "file"  → upload a .docx (checked: really a Word file, no macros, uses known {{details}})
//   GET                      → download the current template, so it can be edited in Word
//   DELETE                   → remove it and go back to the editable wording
// Admins only; the storage rules and the table's policies check the role again.
const MAX_BYTES = 2 * 1024 * 1024;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

async function admin() {
  const me = await getCurrentUser();
  if (!me) return { error: fail("Please sign in again.", 401) };
  if (me.role !== "admin") return { error: fail("Only admins can do that.", 403) };
  return { me };
}

export async function POST(request: NextRequest) {
  const a = await admin();
  if (a.error) return a.error;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail("That file is over 2 MB.", 413);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a Word file first.", 400);
    if (file.size > MAX_BYTES) return fail("That file is over 2 MB.", 413);
    if (!file.name.toLowerCase().endsWith(".docx")) return fail("Upload a Word file saved as .docx.", 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if ((await detectKind(bytes)) !== "docx") return fail("That isn't a valid Word (.docx) file, or it contains macros.", 400);
    let found: string[];
    try {
      const result = await docxPlaceholders(bytes);
      if (result.unknown.length > 0) return fail(`The template uses {{${result.unknown[0]}}}, which isn't a known detail. Check the spelling against the list.`, 400);
      if (result.found.length === 0) return fail("No {{details}} found. Type {{name}}, {{designation}} and so on where the details should go, then upload again.", 400);
      found = result.found;
    } catch {
      return fail("Couldn't read that Word file. Re-save it as .docx and try again.", 400);
    }

    const supabase = await createClient();
    const key = `templates/offer-letter-${crypto.randomUUID()}.docx`;
    const up = await supabase.storage.from(DOC_BUCKET).upload(key, bytes, { contentType: KIND_MIME.docx, upsert: false });
    if (up.error) {
      logError("offer template file upload", up.error);
      return fail("Couldn't store the file. Please try again.", 500);
    }

    const previous = await loadOfferTemplate();
    const { error } = await supabase
      .from("document_templates" as never)
      .upsert(
        { id: "offer_letter", body: previous.body || DEFAULT_OFFER_TEMPLATE, kind: "docx", file_key: key, file_name: file.name.slice(0, 200), updated_by: a.me!.id, updated_at: new Date().toISOString() } as never,
        { onConflict: "id" }
      );
    if (error) {
      await supabase.storage.from(DOC_BUCKET).remove([key]);
      logError("offer template file save", error);
      const missing = ["42P01", "PGRST205", "42703"].includes(error.code ?? "");
      return fail(missing ? "Saving isn't set up yet. Run supabase/step28_document_templates.sql in Supabase." : "Couldn't save the template. Please try again.", 500);
    }
    if (previous.fileKey) await supabase.storage.from(DOC_BUCKET).remove([previous.fileKey]); // the old file is no longer used
    return json({ ok: true, fileName: file.name, found });
  } catch (e) {
    logError("offer template file", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

export async function GET() {
  const a = await admin();
  if (a.error) return a.error;
  const t = await loadOfferTemplate();
  if (t.kind !== "docx") return fail("No Word template has been uploaded.", 404);
  const bytes = await readTemplateFile(t.fileKey);
  if (!bytes) return fail("Couldn't read the template file.", 404);
  const name = t.fileName.replace(/[^\w .()-]+/g, "_") || "offer-letter-template.docx";
  return new NextResponse(Buffer.from(bytes), {
    headers: { ...HEADERS, "Content-Type": KIND_MIME.docx, "Content-Length": String(bytes.byteLength), "Content-Disposition": `attachment; filename="${name}"` },
  });
}

export async function DELETE() {
  const a = await admin();
  if (a.error) return a.error;
  try {
    const t = await loadOfferTemplate();
    if (t.kind !== "docx") return json({ ok: true });
    const supabase = await createClient();
    const { error } = await supabase
      .from("document_templates" as never)
      .update({ kind: "text", file_key: null, file_name: null, updated_by: a.me!.id, updated_at: new Date().toISOString() } as never)
      .eq("id", "offer_letter");
    if (error) {
      logError("offer template file remove", error);
      return fail("Couldn't remove the template. Please try again.", 500);
    }
    await supabase.storage.from(DOC_BUCKET).remove([t.fileKey]);
    return json({ ok: true });
  } catch (e) {
    logError("offer template file remove", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
