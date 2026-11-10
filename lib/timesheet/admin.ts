import "server-only";
import { db, requireAdmin } from "./auth";
import { TimesheetError, assertId, toError } from "./errors";
import type { Person } from "./types";

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "admin";
  created_at: string;
};

/** Everyone with an account, A-Z by name. */
export async function listEmployees(): Promise<Employee[]> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email, role, created_at");
  if (error) throw toError(error, "Couldn't load employees. Please try again.");
  return data
    .map((p) => ({
      id: p.id,
      name: p.full_name?.trim() || p.email.split("@")[0],
      email: p.email,
      role: p.role,
      created_at: p.created_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Make someone an admin or remove their admin role. The database enforces the rules. */
export async function setRole(userId: string, role: "employee" | "admin"): Promise<void> {
  assertId(userId, "person");
  if (role !== "employee" && role !== "admin") throw new TimesheetError("Please choose a valid role.");
  const admin = await requireAdmin();
  if (userId === admin.id) throw new TimesheetError("You cannot change your own role.");
  const supabase = await db();
  const { error } = await supabase.rpc("set_user_role", { target: userId, new_role: role });
  if (error) throw toError(error, "Couldn't change the role. Please try again.");
}

/** How many items wait for a decision, not counting the admin's own (they can't decide those). */
export async function getAdminCounts(): Promise<{ requests: number; logs: number; compOff: number }> {
  const admin = await requireAdmin();
  const supabase = await db();
  const [requests, logs, compOff] = await Promise.all([
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("user_id", admin.id),
    supabase
      .from("work_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("user_id", admin.id),
    // New comp-off requests, and approved ones whose time log changed and need a new decision.
    supabase
      .from("comp_off_requests")
      .select("id", { count: "exact", head: true })
      .or("status.eq.pending,needs_reapproval.eq.true")
      .neq("user_id", admin.id),
  ]);
  if (requests.error) throw toError(requests.error, "Couldn't load counts.");
  if (logs.error) throw toError(logs.error, "Couldn't load counts.");
  if (compOff.error) throw toError(compOff.error, "Couldn't load counts.");
  return { requests: requests.count ?? 0, logs: logs.count ?? 0, compOff: compOff.count ?? 0 };
}

export type LeaveCover = { user_id: string; from_date: string; to_date: string; owner: Person | null };

/** Approved leave (not WFH) overlapping the given dates, for the "Also off" team-cover note. */
export async function listApprovedLeaveBetween(from: string, to: string): Promise<LeaveCover[]> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("requests")
    .select("user_id, from_date, to_date, owner:profiles!requests_user_id_fkey(full_name, email)")
    .eq("status", "approved")
    .eq("type", "leave")
    .lte("from_date", to)
    .gte("to_date", from);
  if (error) throw toError(error, "Couldn't load team cover.");
  return data;
}
