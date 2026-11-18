import { NextResponse, type NextRequest } from "next/server";
import { DOC_BUCKET, DOC_MAX_BYTES, KIND_MIME, checkMeta, kindFromName } from "@/lib/documents/config";
import { deleteDocument, listDocuments } from "@/lib/documents/server";
import { detectKind } from "@/lib/documents/sniff";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Documents API. Every call checks the session first; the database checks again (row-level security and the
// doc_create / doc_delete functions), so a person can't reach another person's documents by changing an id.
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

/** GET /api/documents?user=<id>  → that person's current documents (yourself when omitted). */
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.", 401);
  const asked = request.nextUrl.searchParams.get("user");
  const userId = asked && asked !== me.id ? asked : me.id;
  if (!isUuid(userId)) return fail("That person could not be found.", 400);
  try {
    const list = await listDocuments(userId);
    if (!list.ready) return fail("Documents haven't been set up yet.", 503);
    return json({ ok: true, documents: list.current });
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("documents list", e);
    return fail(e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.", 500);
  }
}

/** POST /api/documents  (multipart: file, category, name, issueDate, expiryDate, notes, [userId], [replaceId], [visibility]) */
export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return fail("Please sign in again.", 401);
    if (Number(request.headers.get("content-length") ?? 0) > DOC_MAX_BYTES + 256 * 1024) return fail("That file is over 10 MB.", 413);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a file first.", 400);
    if (file.size > DOC_MAX_BYTES) return fail("That file is over 10 MB.", 413);

    const field = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
    const target = field("userId") || me.id;
    if (!isUuid(target)) return fail("That person could not be found.", 400);
    if (target !== me.id && me.role !== "admin") return fail("Only admins can add documents for someone else.", 403);
    if (target === me.id && me.role === "viewer") return fail("You have read-only access, so you can't upload documents.", 403);
    const replaceId = field("replaceId");
    if (replaceId && !isUuid(replaceId)) return fail("That document could not be found.", 400);

    const meta = checkMeta({ category: field("category"), name: field("name"), issueDate: field("issueDate"), expiryDate: field("expiryDate"), notes: field("notes") });
    if (!meta.ok) return fail(meta.error, 400);

    // The real type comes from the file's own bytes. It must be an allowed kind AND match what the name says.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = await detectKind(bytes);
    const named = kindFromName(file.name);
    if (!kind || kind !== named) return fail("Only PDF, DOC, DOCX, JPG and PNG files are accepted, and the file must match its type.", 400);

    const supabase = await createClient();
    const key = `${target}/${crypto.randomUUID()}`; // the stored name is random; the real name is only kept as text in the database
    const up = await supabase.storage.from(DOC_BUCKET).upload(key, bytes, { contentType: KIND_MIME[kind], upsert: false });
    if (up.error) {
      logError("documents upload", up.error);
      return fail("Couldn't store the file. Please try again.", 500);
    }

    const { data, error } = await supabase.rpc("doc_create" as never, {
      p_user: target,
      p_category: meta.data.category,
      p_name: meta.data.name,
      p_filename: file.name.slice(0, 200),
      p_key: key,
      p_mime: KIND_MIME[kind],
      p_size: file.size,
      p_issue: meta.data.issueDate,
      p_expiry: meta.data.expiryDate,
      p_notes: meta.data.notes,
      p_visibility: me.role === "admin" ? field("visibility") : "",
      p_replace: replaceId || null,
    } as never);
    if (error) {
      await supabase.storage.from(DOC_BUCKET).remove([key]); // don't leave a file with no record
      logError("documents create", error);
      return fail(error.code === "P0001" ? error.message : "Couldn't save the document. Please try again.", 400);
    }
    return json({ ok: true, id: data });
  } catch (e) {
    logError("documents upload", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

/** DELETE /api/documents?id=<id> */
export async function DELETE(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.", 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!isUuid(id)) return fail("That document could not be found.", 400);
  try {
    await deleteDocument(id);
    return json({ ok: true });
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("documents delete", e);
    return fail(e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.", 400);
  }
}
