import { NextResponse, type NextRequest } from "next/server";
import { loadShellData } from "@/lib/shell/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

// GET /api/shell → { counts, notifications, avatars } for the signed-in person: everything the portal's frame shows, in one call.
// With ?refresh=1 due document reminders are made first (the browser asks about once an hour).
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401, headers: HEADERS });
  try {
    return NextResponse.json({ ok: true, ...(await loadShellData(request.nextUrl.searchParams.get("refresh") === "1")) }, { headers: HEADERS });
  } catch (e) {
    logError("shell data", e);
    return NextResponse.json({ ok: false }, { status: 500, headers: HEADERS });
  }
}
