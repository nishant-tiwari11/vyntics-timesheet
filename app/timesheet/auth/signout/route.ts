import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ends the session and sends the person to the sign-in page with a short reason. Used when someone is still signed in
// but their access has been switched off, has expired, or their sign-in is too old. Signing out is harmless, so a plain
// link is fine here.
const REASONS = new Set(["disabled", "expired", "session"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") ?? "";
  const supabase = await createClient();
  await supabase.auth.signOut();
  const to = new URL("/timesheet/login", url.origin);
  if (REASONS.has(reason)) to.searchParams.set("error", reason);
  const res = NextResponse.redirect(to);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
