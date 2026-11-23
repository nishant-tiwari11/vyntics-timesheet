import { NextResponse, type NextRequest } from "next/server";
import { loadNotifications } from "@/lib/shell/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";

export type { Approvals, NotificationItem } from "@/lib/shell/server";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

// GET /api/notifications → your latest notifications and how many are unread; for an admin also how many requests, work logs
// and comp-offs wait for a decision (`approvals`). The portal itself now gets this together with the menu counts and the profile
// pictures from /api/shell; this stays for anything that wants the notifications alone.
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, items: [], unread: 0, approvals: null }, { status: 401, headers: HEADERS });
  return NextResponse.json({ ok: true, ...(await loadNotifications(request.nextUrl.searchParams.get("refresh") === "1")) }, { headers: HEADERS });
}
