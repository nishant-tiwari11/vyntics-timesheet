"use server";

import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark your own notifications as read: the ones given, or all of them when no list is given. The database function only
 * ever touches the signed-in person's own rows, whatever ids are sent.
 */
export async function markNotificationsReadAction(ids?: string[]): Promise<{ ok: boolean }> {
  if (!(await getCurrentUser())) return { ok: false };
  const list = ids === undefined ? null : ids.filter(isUuid).slice(0, 50);
  if (list !== null && list.length === 0) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("notifications_mark_read" as never, { p_ids: list } as never);
  return { ok: !error };
}
