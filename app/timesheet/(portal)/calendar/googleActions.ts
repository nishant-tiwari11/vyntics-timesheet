"use server";

import { revalidatePath } from "next/cache";
import { disconnect } from "@/lib/google/connection";
import { syncApprovedRequest } from "@/lib/google/sync";
import { requireUser, db } from "@/lib/timesheet/auth";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type GoogleActionResult = { ok: true; message?: string; synced?: number } | { ok: false; error: string };

function fail(e: unknown): GoogleActionResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("google-action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function disconnectGoogleAction(): Promise<GoogleActionResult> {
  try {
    await disconnect();
    revalidatePath("/timesheet/calendar");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Put your upcoming approved leave and WFH into Google (covers anything approved before you connected). With `onlyNew`, a request
 * that is already in Google is left alone, so this can run quietly each time you open the calendar without extra calls to Google.
 */
export async function syncMyRequestsAction(onlyNew = false): Promise<GoogleActionResult> {
  try {
    const me = await requireUser();
    const supabase = await db();
    const { data, error } = await supabase
      .from("requests")
      .select("id")
      .eq("user_id", me.id)
      .eq("status", "approved")
      .gte("to_date", todayInOffice())
      .limit(50);
    if (error) throw new TimesheetError("Couldn't load your requests. Please try again.");
    let todo = data;
    if (onlyNew && data.length > 0) {
      const has = await Promise.all(data.map(async (r) => !!(await supabase.rpc("google_get_event", { p_request: r.id })).data));
      todo = data.filter((_, i) => !has[i]);
    }
    if (todo.length === 0) return { ok: true, synced: 0, message: "Nothing to sync: your approved leave and WFH are already in Google Calendar." };

    let synced = 0;
    for (const r of todo) if (await syncApprovedRequest(r.id)) synced += 1;
    if (synced < todo.length) {
      return { ok: false, error: `Synced ${synced} of ${todo.length}. Google didn't accept the rest. Please try again.` };
    }
    return { ok: true, synced, message: `Added ${synced} ${synced === 1 ? "request" : "requests"} to Google Calendar.` };
  } catch (e) {
    return fail(e);
  }
}
