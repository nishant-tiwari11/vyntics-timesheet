"use server";

import { revalidatePath } from "next/cache";
import { disconnect } from "@/lib/google/connection";
import { syncApprovedRequest } from "@/lib/google/sync";
import { requireUser, db } from "@/lib/timesheet/auth";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type GoogleActionResult = { ok: true; message?: string } | { ok: false; error: string };

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

/** Put your upcoming approved leave and WFH into Google (covers anything approved before you connected). */
export async function syncMyRequestsAction(): Promise<GoogleActionResult> {
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
    if (data.length === 0) return { ok: true, message: "Nothing to sync: you have no upcoming approved leave or WFH." };

    let synced = 0;
    for (const r of data) if (await syncApprovedRequest(r.id)) synced += 1;
    if (synced < data.length) {
      return { ok: false, error: `Synced ${synced} of ${data.length}. Google didn't accept the rest. Please try again.` };
    }
    return { ok: true, message: `Synced ${synced} ${synced === 1 ? "request" : "requests"} to Google Calendar.` };
  } catch (e) {
    return fail(e);
  }
}
