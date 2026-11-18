import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { DOC_BUCKET, categoryLabel, extensionOf } from "@/lib/documents/config";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";

// POST /api/documents/zip   { ids: string[] }  → one ZIP with the chosen documents, in a folder per employee and category.
// Admins only. Capped so one request can't use up the server's memory. Every file is written to the audit trail.
const MAX_FILES = 100;
const MAX_BYTES = 150 * 1024 * 1024;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: HEADERS });

const safe = (s: string) => s.replace(/[^\w .()-]+/g, "_").trim().slice(0, 60) || "x";

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.", 401);
  if (me.role !== "admin") return fail("Only admins can do that.", 403);

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter(isUuid))] : [];
  if (ids.length === 0) return fail("Choose at least one document.", 400);
  if (ids.length > MAX_FILES) return fail(`Choose up to ${MAX_FILES} documents at a time.`, 400);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_documents" as never)
      .select("id, user_id, category, name, original_filename, storage_key, size_bytes, version")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) throw error;
    const docs = (data ?? []) as unknown as { id: string; user_id: string; category: string; name: string; original_filename: string; storage_key: string; size_bytes: number; version: number }[];
    if (docs.length === 0) return fail("Those documents no longer exist.", 404);
    if (docs.reduce((n, d) => n + d.size_bytes, 0) > MAX_BYTES) return fail("That is too much to download at once. Choose fewer documents.", 413);

    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", [...new Set(docs.map((d) => d.user_id))]);
    const who = new Map((people ?? []).map((p) => [p.id, displayName(p)]));

    const zip = new JSZip();
    const used = new Set<string>();
    for (const d of docs) {
      const file = await supabase.storage.from(DOC_BUCKET).download(d.storage_key);
      if (file.error || !file.data) continue;
      const ext = extensionOf(d.original_filename) || "bin";
      let path = `${safe(who.get(d.user_id) ?? "Employee")}/${safe(categoryLabel(d.category))}/${safe(d.name)}${d.version > 1 ? ` (v${d.version})` : ""}`;
      while (used.has(`${path}.${ext}`)) path += " (2)";
      used.add(`${path}.${ext}`);
      zip.file(`${path}.${ext}`, await file.data.arrayBuffer());
    }
    if (used.size === 0) return fail("Couldn't read any of those files.", 404);

    await supabase.from("document_audit" as never).insert(docs.map((d) => ({ document_id: d.id, action: "download" })) as never);

    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new NextResponse(Buffer.from(out), {
      headers: {
        ...HEADERS,
        "Content-Type": "application/zip",
        "Content-Length": String(out.byteLength),
        "Content-Disposition": `attachment; filename="documents-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    });
  } catch (e) {
    logError("documents zip", e);
    return fail("Couldn't prepare the download. Please try again.", 500);
  }
}
