import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends people back here with a one-time code. We swap it for a session cookie, then ask the database whether
// this person may use the portal (company domain, or on the admin's list; not disabled; not expired). If not, the
// session is ended again and they see "You don't have access" on the login page.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const login = (reason: "not_allowed" | "failed" | "disabled" | "expired") => NextResponse.redirect(new URL(`/timesheet/login?error=${reason}`, url.origin));

  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return login(providerError.toLowerCase().includes("database error saving new user") ? "not_allowed" : "failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return login("failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return login("failed");

  // Also records the sign-in time. Before step24_access.sql has been run this function doesn't exist; then we let the
  // person in exactly as before (the older database rule already limited who could have an account).
  const { data: verdict, error: checkError } = await supabase.rpc("access_after_login");
  if (!checkError && verdict !== "ok") {
    await supabase.auth.signOut();
    return login(verdict === "disabled" || verdict === "expired" ? verdict : "not_allowed");
  }

  // The name comes from the work email (ved.sharma@vyntics.com is Ved Sharma). Before step35 this function doesn't exist, which is fine.
  await supabase.rpc("profile_sync_name" as never);

  return NextResponse.redirect(new URL("/timesheet", url.origin));
}
