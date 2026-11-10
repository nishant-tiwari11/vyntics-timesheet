import "server-only";
import { db, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError } from "@/lib/timesheet/errors";
import { GOOGLE_SCOPE } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { GoogleError } from "./http";
import { accessTokenFromRefresh, revokeToken } from "./oauth";

// Tokens only ever exist in readable form inside these functions, on the server. The database holds the
// encrypted text and is reached through the SQL functions in supabase/step14_google_calendar.sql.

/** Is the signed-in user connected? False when the SQL step hasn't been run yet. */
export async function isConnected(): Promise<boolean> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.rpc("google_is_connected");
  return !error && data === true;
}

export async function saveConnection(refreshToken: string, scope: string): Promise<void> {
  await requireUser();
  const supabase = await db();
  const { error } = await supabase.rpc("google_save_connection", {
    p_ciphertext: encryptToken(refreshToken),
    p_scope: scope || GOOGLE_SCOPE,
  });
  if (error) throw new TimesheetError("Couldn't save the Google connection. Please try again.");
}

/** Forget the connection: tell Google to drop the grant (best effort), then delete our copy. */
export async function disconnect(): Promise<void> {
  const me = await requireUser();
  const supabase = await db();
  const { data } = await supabase.rpc("google_get_connection", { p_user: me.id });
  if (data) {
    try {
      await revokeToken(decryptToken(data));
    } catch {}
  }
  const { error } = await supabase.rpc("google_delete_connection", { p_user: me.id });
  if (error) throw new TimesheetError("Couldn't disconnect Google Calendar. Please try again.");
}

/**
 * A fresh access token for that person, or null when they haven't connected (the normal "skip silently" case).
 * If Google says the access was revoked, the dead connection is removed so the page shows "not connected".
 */
export async function accessTokenFor(userId: string): Promise<string | null> {
  const supabase = await db();
  const { data: stored, error } = await supabase.rpc("google_get_connection", { p_user: userId });
  if (error || !stored) return null;
  try {
    return await accessTokenFromRefresh(decryptToken(stored));
  } catch (e) {
    if (e instanceof GoogleError && e.revoked) {
      await supabase.rpc("google_delete_connection", { p_user: userId });
      return null;
    }
    throw e;
  }
}
