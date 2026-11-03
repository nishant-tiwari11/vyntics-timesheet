import { cache } from "react";
import { createClient } from "./server";

export type Role = "employee" | "admin";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// Returns the signed-in user's id, name, email and role (from public.profiles),
// or null when nobody is signed in. Cached per request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? "";
  const name =
    profile?.full_name?.trim() ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    email.split("@")[0];

  return {
    id: user.id,
    name,
    email,
    role: profile?.role === "admin" ? "admin" : "employee",
  };
});
