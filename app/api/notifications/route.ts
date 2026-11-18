import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export type NotificationItem = { id: string; title: string; body: string; link: string; read: boolean; at: string };

// GET /api/notifications → your latest notifications and how many are unread. It first makes any reminders that are due
// (missing documents, documents about to expire). Before step27_document_admin.sql has been run it just returns nothing.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, items: [], unread: 0 }, { status: 401, headers: HEADERS });
  try {
    const supabase = await createClient();
    await supabase.rpc("docs_refresh_reminders" as never);
    const [list, unread] = await Promise.all([
      supabase.from("notifications" as never).select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("notifications" as never).select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (list.error) return NextResponse.json({ ok: true, items: [], unread: 0 }, { headers: HEADERS });
    const items = ((list.data ?? []) as unknown as { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]).map(
      (n): NotificationItem => ({ id: n.id, title: n.title, body: n.body ?? "", link: n.link ?? "", read: !!n.read_at, at: n.created_at })
    );
    return NextResponse.json({ ok: true, items, unread: unread.count ?? 0 }, { headers: HEADERS });
  } catch (e) {
    logError("notifications", e);
    return NextResponse.json({ ok: true, items: [], unread: 0 }, { headers: HEADERS });
  }
}
