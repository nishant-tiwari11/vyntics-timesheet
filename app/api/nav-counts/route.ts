import { NextResponse } from "next/server";
import { loadNavCounts } from "@/lib/admin/navCounts";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

// GET /api/nav-counts → { counts: { "/timesheet/admin": 3, ... } }: the numbers on the menu. Only about you.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, counts: {} }, { status: 401, headers: HEADERS });
  try {
    return NextResponse.json({ ok: true, counts: await loadNavCounts() }, { headers: HEADERS });
  } catch (e) {
    logError("nav counts", e);
    return NextResponse.json({ ok: true, counts: {} }, { headers: HEADERS });
  }
}
