import { cache } from "react";
import { sessionMaxHours, toRole, type Role } from "@/lib/access/config";
import { createClient } from "./server";

export type { Role };

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** Why a signed-in person must be signed out again. */
export type AccessBlock = "disabled" | "expired" | "session";

type Loaded = { user: CurrentUser; block: AccessBlock | null } | null;

// One look at the signed-in person per request: who they are (from public.profiles), and whether their access is
// still valid (not disabled, not past its expiry date, sign-in not older than SESSION_MAX_HOURS).
const load = cache(async (): Promise<Loaded> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The access columns come from supabase/step24_access.sql. Until that has been run the first query fails, and we fall
  // back to the older columns so nobody is locked out in the meantime.
  let profile: { full_name: string | null; email: string; role: string; status?: string; access_expires_on?: string | null } | null = null;
  const withAccess = await supabase.from("profiles").select("full_name, email, role, status, access_expires_on").eq("id", user.id).maybeSingle();
  if (!withAccess.error) {
    profile = withAccess.data;
  } else {
    const legacy = await supabase.from("profiles").select("full_name, email, role").eq("id", user.id).maybeSingle();
    profile = legacy.data;
  }

  const email = profile?.email ?? user.email ?? "";
  const name =
    profile?.full_name?.trim() ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    email.split("@")[0];
  const current: CurrentUser = { id: user.id, name, email, role: toRole(profile?.role) ?? "employee" };

  let block: AccessBlock | null = null;
  if (!profile) block = "disabled"; // an account with no profile has not been let in by the database
  else if (profile.status === "disabled") block = "disabled";
  else if (profile.access_expires_on && profile.access_expires_on < new Date().toISOString().slice(0, 10)) block = "expired";
  else if (user.last_sign_in_at && Date.now() - new Date(user.last_sign_in_at).getTime() > sessionMaxHours() * 3_600_000) block = "session";
  return { user: current, block };
});

// Returns the signed-in user's id, name, email and role (from public.profiles), or null when nobody is signed in or
// their access has been switched off. Cached per request. Because every server action and page asks here, a disabled
// or expired account stops working at once, not only at the next sign-in.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const loaded = await load();
  return loaded && !loaded.block ? loaded.user : null;
});

/** Set when someone is still signed in but must not be: send them to /timesheet/auth/signout?reason=... */
export const getAccessBlock = cache(async (): Promise<AccessBlock | null> => (await load())?.block ?? null);
