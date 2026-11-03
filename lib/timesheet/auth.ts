import "server-only";
import { getCurrentUser, type CurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { TimesheetError } from "./errors";

// Who is calling is always taken from the session cookie, never from function arguments.

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new TimesheetError("Your session has expired. Please sign in again.");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new TimesheetError("Only admins can do that.");
  return user;
}

export async function db() {
  return createClient();
}
