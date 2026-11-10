import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { googleConfig } from "@/lib/google/config";
import { authUrl } from "@/lib/google/oauth";

const STATE_COOKIE = "ts-google-state";
const BACK = "/timesheet/calendar";

// Step 1 of connecting: send the signed-in user to Google's consent screen. The random `state` is also kept in
// a short-lived cookie, so the callback can tell this really is the flow this browser started.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/timesheet/login", origin));
  if (!googleConfig()) return NextResponse.redirect(new URL(`${BACK}?google=unconfigured`, origin));

  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/timesheet/google",
    maxAge: 600,
  });
  return NextResponse.redirect(authUrl(state, user.email));
}
