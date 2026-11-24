import { NextResponse, type NextRequest } from "next/server";
import { readAsset, readLogo } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";

// GET /api/offers/asset?kind=logo|signature|seal: the pictures drawn on offer letters (the logo falls back to the portal's own).
// Any signed-in person, because an employee's preview of their own letter shows them too.
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return new NextResponse("Please sign in.", { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "logo" && kind !== "signature" && kind !== "seal") return new NextResponse("Unknown picture.", { status: 400 });
  const bytes = kind === "logo" ? await readLogo() : await readAsset(kind);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" } });
}
