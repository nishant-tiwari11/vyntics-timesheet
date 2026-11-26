import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { supabaseEnv } from "./env";

// With TS_TRACE=1 in .env.local, every database call is written to the server log with how long it took, to find slow pages.
const traced: typeof fetch = async (input, init) => {
  const t = performance.now();
  const res = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  console.log(`[db] ${Math.round(performance.now() - t)}ms ${init?.method ?? "GET"} ${url.replace(/^https?:\/\/[^/]+/, "").slice(0, 110)}`);
  return res;
};

// Server client (Server Components, Server Actions, Route Handlers).
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    ...(process.env.TS_TRACE === "1" ? { global: { fetch: traced } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component: cookies can't be set here.
          // Safe to ignore because proxy.ts refreshes the session.
        }
      },
    },
  });
}
