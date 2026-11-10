import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { saveConnection } from "@/lib/google/connection";
import { exchangeCode } from "@/lib/google/oauth";
import { logError } from "@/lib/timesheet/log";

const STATE_COOKIE = "ts-google-state";
const BACK = "/timesheet/calendar";

// Step 2: Google sends the user back here with a one-time code. We swap it for tokens on the server, encrypt the
// refresh token and store it. The tokens never reach the browser.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const done = (result: string) => {
    const res = NextResponse.redirect(new URL(`${BACK}?google=${result}`, url.origin));
    res.cookies.delete({ name: STATE_COOKIE, path: "/timesheet/google" });
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/timesheet/login", url.origin));

  // The person closed or refused the consent screen.
  if (url.searchParams.get("error")) return done("denied");

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  if (!expected || url.searchParams.get("state") !== expected || !code) return done("error");

  try {
    const tokens = await exchangeCode(code);
    // Without a refresh token we couldn't keep syncing. Google only sends one on the first consent.
    if (!tokens.refresh_token) return done("no_refresh");
    await saveConnection(tokens.refresh_token, tokens.scope ?? "");
    return done("connected");
  } catch (e) {
    logError("google-connect", e);
    return done("error");
  }
}
