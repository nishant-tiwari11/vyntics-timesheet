import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";
import { supabaseEnv } from "./env";

const LOGIN = "/timesheet/login";
const HOME = "/timesheet"; // the index page sends each role to its own start page
const CALLBACK = "/timesheet/auth/callback";

// Middleware client: refreshes the session cookie and guards /timesheet routes.
export async function updateSession(request: NextRequest) {
  // The Google sign-in callback has no session yet; it creates one. Let it through untouched.
  if (request.nextUrl.pathname.replace(/\/$/, "") === CALLBACK) return NextResponse.next({ request });

  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Don't put code between createServerClient and getClaims().
  // getClaims() checks the sign-in token's signature on this server (the project signs with asymmetric keys, fetched once and
  // kept), so there is no round trip to the Auth service on every page. It still refreshes an expired session. Whether the
  // person is still allowed in (disabled, expired) is checked from their profile on every request, in getCurrentUser.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub as string } : null;

  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const onLogin = path === LOGIN;

  // Who may be signed in is decided by the database (company-domain Google account, or on the admin's list; see
  // supabase/step24_access.sql) and re-checked on every page by the portal layout, which signs out anyone whose access
  // has been switched off. So this only has to separate "signed in" from "not signed in".
  let result = response;
  if (!user && !onLogin) {
    result = redirectKeepingCookies(request, LOGIN, response);
  } else if (user && onLogin) {
    result = redirectKeepingCookies(request, HOME, response);
  }
  // /timesheet/admin is not checked here: the admin layout and every admin page and action check the role themselves, so a second
  // database look-up on every admin page would only add waiting.

  // The X-Robots-Tag and other security headers come from next.config.ts (single source).
  return result;
}

function redirectKeepingCookies(request: NextRequest, to: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
