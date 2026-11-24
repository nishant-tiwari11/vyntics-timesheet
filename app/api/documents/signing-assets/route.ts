import { NextResponse, type NextRequest } from "next/server";
import { IMAGE_MAX_BYTES, type AssetKind, readSigningImage, removeSigningImage, saveSigningImage, signingImageStatus } from "@/lib/documents/signingAssets";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { logError } from "@/lib/timesheet/log";

// The signature and company seal pictures. Admins only.
//   GET                       → { signature: boolean, seal: boolean }
//   GET ?kind=seal&image=1    → the picture itself (for the preview)
//   POST multipart kind, file → upload or replace
//   DELETE ?kind=seal         → remove
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
const fail = (error: string, status: number) => json({ ok: false, error }, status);
const kindOf = (v: unknown): AssetKind | null => (["signature", "seal", "logo"] as readonly unknown[]).includes(v) ? (v as AssetKind) : null;

async function admin() {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.", 401);
  if (me.role !== "admin") return fail("Only admins can do that.", 403);
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;
  const kind = kindOf(request.nextUrl.searchParams.get("kind"));
  if (kind && request.nextUrl.searchParams.get("image") === "1") {
    const bytes = await readSigningImage(kind);
    if (!bytes) return new NextResponse("Not found", { status: 404, headers: HEADERS });
    return new NextResponse(Buffer.from(bytes), { headers: { ...HEADERS, "Content-Type": "image/png" } });
  }
  try {
    return json({ ok: true, ...(await signingImageStatus()) });
  } catch (e) {
    logError("signing assets status", e);
    return json({ ok: true, signature: false, seal: false, logo: false });
  }
}

export async function POST(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > IMAGE_MAX_BYTES + 64 * 1024) return fail("That picture is over 1 MB.", 413);
    const form = await request.formData();
    const kind = kindOf(form.get("kind"));
    const file = form.get("file");
    if (!kind) return fail("Choose signature, seal or logo.", 400);
    if (!(file instanceof File)) return fail("Choose a picture first.", 400);
    const res = await saveSigningImage(kind, new Uint8Array(await file.arrayBuffer()));
    return res.ok ? json({ ok: true }) : fail(res.error, 400);
  } catch (e) {
    logError("signing assets upload", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await admin();
  if (denied) return denied;
  const kind = kindOf(request.nextUrl.searchParams.get("kind"));
  if (!kind) return fail("Choose signature, seal or logo.", 400);
  return (await removeSigningImage(kind)) ? json({ ok: true }) : fail("Couldn't remove the picture. Please try again.", 500);
}
