"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

/** Turn your own Google Chat reminders on or off. The database function only ever changes the signed-in person's own row. */
export async function setChatRemindersAction(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("chat_reminders_set" as never, { p_on: on === true } as never);
  if (error) {
    logError("chat reminders opt-out", error);
    const missing = ["42883", "PGRST202"].includes(error.code ?? "");
    return { ok: false, error: missing ? "Chat reminders aren't set up yet." : "Something went wrong. Please try again." };
  }
  revalidatePath("/timesheet/profile");
  return { ok: true };
}
