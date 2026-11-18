import { NextResponse, type NextRequest } from "next/server";
import { DOC_BUCKET, canPreview, extensionOf } from "@/lib/documents/config";
import { getDocument, logDocumentAccess } from "@/lib/documents/server";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

// GET /api/documents/<id>/download            → the file as a download
// GET /api/documents/<id>/download?inline=1   → the file for the preview window (PDF and images only)
// The file is read with the caller's own session, so the database decides whether they may have it. Every open and
// download is written to the audit trail. Nothing is cached anywhere.
const SAFE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "SAMEORIGIN" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404, headers: SAFE });
  const me = await getCurrentUser();
  if (!me) return new NextResponse("Please sign in again.", { status: 401, headers: SAFE });

  try {
    const doc = await getDocument(id);
    if (!doc) return new NextResponse("Not found", { status: 404, headers: SAFE });

    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(DOC_BUCKET).download(doc.key);
    if (error || !data) return new NextResponse("Not found", { status: 404, headers: SAFE });

    const inline = request.nextUrl.searchParams.get("inline") === "1" && canPreview(doc.mime);
    await logDocumentAccess(doc.id, inline ? "view" : "download").catch(() => {});

    // A plain, safe download name: the document's name with the original extension. Never the stored key.
    const ext = extensionOf(doc.filename) || "bin";
    const base = doc.name.replace(/[^\w .()-]+/g, "_").trim().slice(0, 80) || "document";
    const fileName = `${base}.${ext}`;
    return new NextResponse(data, {
      headers: {
        ...SAFE,
        "Content-Type": doc.mime,
        "Content-Length": String(data.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (e) {
    logError("documents download", e);
    return new NextResponse("Something went wrong.", { status: 500, headers: SAFE });
  }
}
