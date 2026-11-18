import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export type NotificationItem = { id: string; title: string; body: string; link: string; read: boolean; at: string };
/** For admins: how many things wait for a decision. */
export type Approvals = { requests: number; logs: number; compOff: number; total: number };

// GET /api/notifications → your latest notifications and how many are unread; for an admin also how many requests, work logs
// and comp-offs wait for a decision (`approvals`). With ?refresh=1 it first makes any reminders that are due (missing
// documents, documents about to expire). Before step27_document_admin.sql has been run the notifications part is just empty,
// and the admin's waiting count still comes through.
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, items: [], unread: 0, approvals: null }, { status: 401, headers: HEADERS });

  const supabase = await createClient();

  // Admins: the waiting count, fetched at the same time as the notifications. A problem here never hides the notifications.
  const approvalsTask: Promise<Approvals | null> =
    me.role === "admin"
      ? getAdminCounts()
          .then((c) => ({ ...c, total: c.requests + c.logs + c.compOff }))
          .catch((e) => {
            logError("notifications approvals", e);
            return null;
          })
      : Promise.resolve(null);

  const notificationsTask = (async () => {
    try {
      // Reminders are only made when asked (the browser asks about once an hour); the database also limits it to every 6 hours.
      if (request.nextUrl.searchParams.get("refresh") === "1") await supabase.rpc("docs_refresh_reminders" as never);
      const [list, unread] = await Promise.all([
        supabase.from("notifications" as never).select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("notifications" as never).select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (list.error) return { items: [] as NotificationItem[], unread: 0 };
      const items = ((list.data ?? []) as unknown as { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]).map(
        (n): NotificationItem => ({ id: n.id, title: n.title, body: n.body ?? "", link: n.link ?? "", read: !!n.read_at, at: n.created_at })
      );
      return { items, unread: unread.count ?? 0 };
    } catch (e) {
      logError("notifications", e);
      return { items: [] as NotificationItem[], unread: 0 };
    }
  })();

  const [approvals, notifications] = await Promise.all([approvalsTask, notificationsTask]);
  return NextResponse.json({ ok: true, ...notifications, approvals }, { headers: HEADERS });
}
