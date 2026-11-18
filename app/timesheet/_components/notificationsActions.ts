"use server";

import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";

/** Mark all of your notifications as read. Only ever touches your own (the database function uses your session). */
export async function markNotificationsReadAction(): Promise<{ ok: boolean }> {
  if (!(await getCurrentUser())) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("notifications_mark_read" as never, { p_ids: null } as never);
  return { ok: !error };
}
