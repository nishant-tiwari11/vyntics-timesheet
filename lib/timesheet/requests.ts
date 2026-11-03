import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { TimesheetError, assertDate, assertId, toError } from "./errors";
import type { Request, RequestWithPerson } from "./types";

/** The signed-in user's own requests, newest dates first. */
export async function listRequests(): Promise<Request[]> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("requests")
    .select("*")
    .eq("user_id", me.id)
    .order("from_date", { ascending: false });
  if (error) throw toError(error, "Couldn't load your requests. Please try again.");
  return data;
}

export async function createRequest(input: {
  type: "leave" | "wfh";
  from: string;
  to: string;
  note?: string;
}): Promise<Request> {
  if (input.type !== "leave" && input.type !== "wfh") {
    throw new TimesheetError("Please choose Leave or Work from home.");
  }
  const from = assertDate(input.from, "start date");
  const to = assertDate(input.to, "end date");
  if (to < from) throw new TimesheetError("The end date can't be before the start date.");
  const note = input.note?.trim() ?? "";
  if (note.length > 500) throw new TimesheetError("The reason can be up to 500 characters.");

  const me = await requireUser();
  const supabase = await db();
  // user_id and status come from the server, never from the caller.
  const { data, error } = await supabase
    .from("requests")
    .insert({
      user_id: me.id,
      type: input.type,
      from_date: from,
      to_date: to,
      reason: note || null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw toError(error, "Couldn't send your request. Please try again.");
  return data;
}

/** Cancel your own request while it is still pending. */
export async function cancelRequest(id: string): Promise<Request> {
  assertId(id, "request");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw toError(error, "Couldn't cancel the request. Please try again.");
  if (!data) throw new TimesheetError("Only a pending request can be cancelled.");
  return data;
}

// ---------------------------- Admin only ----------------------------

/**
 * Requests from everyone. "pending" = only pending ones; "all" = everything.
 * Pending first, then newest; at most `limit` rows.
 */
export async function listAllRequests(filter: "pending" | "all" = "all", limit = 50): Promise<RequestWithPerson[]> {
  await requireAdmin();
  const max = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const supabase = await db();
  const select = "*, owner:profiles!requests_user_id_fkey(full_name, email)";

  const pendingQuery = supabase
    .from("requests")
    .select(select)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(max);
  if (filter === "pending") {
    const { data, error } = await pendingQuery;
    if (error) throw toError(error, "Couldn't load requests. Please try again.");
    return data;
  }

  const [pending, others] = await Promise.all([
    pendingQuery,
    supabase
      .from("requests")
      .select(select)
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(max),
  ]);
  if (pending.error) throw toError(pending.error, "Couldn't load requests. Please try again.");
  if (others.error) throw toError(others.error, "Couldn't load requests. Please try again.");
  return [...pending.data, ...others.data].slice(0, max);
}

export async function decideRequest(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<Request> {
  assertId(id, "request");
  if (decision !== "approved" && decision !== "rejected") {
    throw new TimesheetError("Please choose approve or reject.");
  }
  const admin = await requireAdmin();
  const supabase = await db();

  const { data: current, error: readError } = await supabase
    .from("requests")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw toError(readError, "Couldn't save your decision. Please try again.");
  if (!current) throw new TimesheetError("That request no longer exists. Please refresh.");
  if (current.user_id === admin.id) throw new TimesheetError("You cannot decide your own request.");

  const { data, error } = await supabase
    .from("requests")
    .update({
      status: decision,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: note?.trim().slice(0, 500) || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw toError(error, "Couldn't save your decision. Please try again.");
  if (!data) throw new TimesheetError("Only pending requests can be approved or rejected.");
  return data;
}
