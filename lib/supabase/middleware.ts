import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCompanyEmail } from "../companyEmail";
import type { Database } from "./types";
import { supabaseEnv } from "./env";

const LOGIN = "/timesheet/login";
const HOME = "/timesheet/dashboard";
const ADMIN = "/timesheet/admin";
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

  // Don't put code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const onLogin = path === LOGIN;
  const onAdmin = path === ADMIN || path.startsWith(`${ADMIN}/`);

  // Signed in with a non-company email: end the session. `response` now carries the cleared cookies.
  if (user && !isCompanyEmail(user.email)) {
    await supabase.auth.signOut();
    return onLogin ? response : redirectKeepingCookies(request, LOGIN, response);
  }

  let result = response;
  if (!user && !onLogin) {
    result = redirectKeepingCookies(request, LOGIN, response);
  } else if (user && onLogin) {
    result = redirectKeepingCookies(request, HOME, response);
  } else if (user && onAdmin) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      result = redirectKeepingCookies(request, HOME, response);
    }
  }

  // The X-Robots-Tag and other security headers come from next.config.ts (single source).
  return result;
}

function redirectKeepingCookies(request: NextRequest, to: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
