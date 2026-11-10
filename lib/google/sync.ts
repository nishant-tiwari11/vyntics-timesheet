import "server-only";
import { db } from "@/lib/timesheet/auth";
import { logError } from "@/lib/timesheet/log";
import { accessTokenFor } from "./connection";
import { createEvent, deleteEvent, updateEvent, type AllDayEvent } from "./events";

// One-way sync, portal -> Google. Every function here swallows its own errors (they are logged) because a
// Google problem must never get in the way of approving a request.

type RequestRow = { id: string; user_id: string; type: "leave" | "wfh"; status: string; from_date: string; to_date: string };

const LABEL = { leave: "Leave", wfh: "WFH" } as const;

function eventFor(r: RequestRow): AllDayEvent {
  return {
    requestId: r.id,
    summary: LABEL[r.type],
    // Deliberately short: the reason you gave is never sent to Google.
    description: `${r.type === "leave" ? "Approved leave" : "Approved work from home"}. Added by Vyntics Timesheet.`,
    from: r.from_date,
    to: r.to_date,
    busy: r.type === "leave",
  };
}

/** Create the event for an approved request, or update it if it already exists. Returns true when it is in Google. */
export async function syncApprovedRequest(requestId: string): Promise<boolean> {
  try {
    const supabase = await db();
    const { data: row } = await supabase
      .from("requests")
      .select("id, user_id, type, status, from_date, to_date")
      .eq("id", requestId)
      .maybeSingle();
    if (!row || row.status !== "approved") return false;

    const token = await accessTokenFor(row.user_id);
    if (!token) return false; // not connected: skip silently

    const event = eventFor(row);
    const { data: existing } = await supabase.rpc("google_get_event", { p_request: row.id });
    if (existing && (await updateEvent(token, existing, event))) return true;

    const id = await createEvent(token, event);
    await supabase.rpc("google_set_event", { p_request: row.id, p_event: id });
    return true;
  } catch (e) {
    logError("google-sync", e);
    return false;
  }
}

/** Remove the event of a request that is no longer approved (cancelled, rejected or deleted). */
export async function removeRequestEvent(requestId: string): Promise<void> {
  try {
    const supabase = await db();
    const { data: row } = await supabase.from("requests").select("user_id").eq("id", requestId).maybeSingle();
    const { data: existing } = await supabase.rpc("google_get_event", { p_request: requestId });
    if (!row || !existing) return;
    const token = await accessTokenFor(row.user_id);
    if (!token) return;
    await deleteEvent(token, existing);
    await supabase.rpc("google_clear_event", { p_request: requestId });
  } catch (e) {
    logError("google-sync", e);
  }
}
