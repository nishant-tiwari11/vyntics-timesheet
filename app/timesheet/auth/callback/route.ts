import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends people back here with a one-time code. We swap it for a session cookie,
// then send them to the dashboard. If the database refuses the account (not on the admin's list,
// or not a @vyntics.com address), we send them back to the login page with a short code.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const login = (reason: "not_allowed" | "failed") => NextResponse.redirect(new URL(`/timesheet/login?error=${reason}`, url.origin));

  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return login(providerError.toLowerCase().includes("database error saving new user") ? "not_allowed" : "failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return login("failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return login("failed");

  return NextResponse.redirect(new URL("/timesheet/dashboard", url.origin));
}
