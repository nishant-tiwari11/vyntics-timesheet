import "server-only";
import { createClient } from "@supabase/supabase-js";

// A database connection that is not tied to a signed-in person, for scheduled jobs (nobody is logged in when a cron runs).
// It uses the service role key, which skips row-level security, so it is used ONLY by code that has already checked who is
// asking (the cron route checks CRON_SECRET). Never import this from a page, a server action or anything a user can trigger.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
