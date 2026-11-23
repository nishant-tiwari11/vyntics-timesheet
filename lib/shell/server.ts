import "server-only";
import { loadNavCounts } from "@/lib/admin/navCounts";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { logError } from "@/lib/timesheet/log";

// Everything the portal's frame (menu counts, the notification bell, profile pictures) needs, in ONE request: one sign-in check
// and one round of database calls made together, instead of three separate requests each doing their own.

export type NotificationItem = { id: string; title: string; body: string; link: string; read: boolean; at: string };
/** For admins: how many things wait for a decision. */
export type Approvals = { requests: number; logs: number; compOff: number; total: number };
export type NotificationsData = { items: NotificationItem[]; unread: number; approvals: Approvals | null };

export type ShellData = {
  counts: Record<string, number>;
  notifications: NotificationsData;
  /** Who has a profile picture, and a number that changes when it does (the stored file's time). */
  avatars: Record<string, number>;
};

const EMPTY: NotificationsData = { items: [], unread: 0, approvals: null };

/** Your latest notifications, and (for an admin) how much waits for a decision. With `refresh`, due reminders are made first. */
export async function loadNotifications(refresh: boolean): Promise<NotificationsData> {
  const me = await getCurrentUser();
  if (!me) return EMPTY;
  const supabase = await createClient();

  const approvalsTask: Promise<Approvals | null> =
    me.role === "admin"
      ? getAdminCounts()
          .then((c) => ({ ...c, total: c.requests + c.logs + c.compOff }))
          .catch((e) => {
            logError("notifications approvals", e);
            return null;
          })
      : Promise.resolve(null);

  const listTask = (async () => {
    try {
      // Reminders are only made when asked (the browser asks about once an hour); the database also limits it to every 6 hours.
      if (refresh) await supabase.rpc("docs_refresh_reminders" as never);
      const [list, unread] = await Promise.all([
        supabase.from("notifications" as never).select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("notifications" as never).select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      if (list.error) return { items: [] as NotificationItem[], unread: 0 };
      const items = ((list.data ?? []) as unknown as { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]).map(
        (n): NotificationItem => ({ id: n.id, title: n.title, body: n.body ?? "", link: n.link ?? "", read: !!n.read_at, at: n.created_at }),
      );
      return { items, unread: unread.count ?? 0 };
    } catch (e) {
      logError("notifications", e);
      return { items: [] as NotificationItem[], unread: 0 };
    }
  })();

  const [approvals, list] = await Promise.all([approvalsTask, listTask]);
  return { ...list, approvals };
}

async function loadAvatars(): Promise<Record<string, number>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list("", { limit: 1000 });
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const f of data ?? []) {
      const m = /^([0-9a-f-]{36})\.webp$/i.exec(f.name);
      if (m) out[m[1].toLowerCase()] = Date.parse(f.updated_at ?? f.created_at ?? "") || 1;
    }
    return out;
  } catch (e) {
    logError("shell avatars", e);
    return {};
  }
}

export async function loadShellData(refresh: boolean): Promise<ShellData> {
  const [counts, notifications, avatars] = await Promise.all([loadNavCounts().catch(() => ({}) as Record<string, number>), loadNotifications(refresh), loadAvatars()]);
  return { counts, notifications, avatars };
}
