import "server-only";
import { nameFromEmail } from "@/lib/nameFromEmail";
import { db, requireAdmin } from "@/lib/timesheet/auth";
import { TimesheetError, toError } from "@/lib/timesheet/errors";
import { allowedDomains, isAllowedDomain, toRole, type Role, type SignInMethod } from "./config";
import { addUserSchema, bulkSchema, firstIssue, resetPasswordSchema, updateUserSchema, emailSchema, type AddUserInput } from "./schemas";

// Everything the admin's Access page does. Every function starts with requireAdmin() (checked on the server each time),
// and the database functions check for an admin again. Passwords are only ever passed straight to the database, which
// stores a bcrypt hash; they are never logged, returned or written to the audit log.

export type AccessRow = {
  /** Their account id; null for someone on the list who has not signed in yet. */
  userId: string | null;
  email: string;
  name: string;
  role: Role;
  /** Domain = signs in by being on a company domain. Manual = added to the list by an admin or the seed. */
  type: "domain" | "manual";
  loginMethod: SignInMethod | null;
  status: "active" | "disabled";
  removedAt: string | null;
  expiresOn: string | null;
  lastLogin: string | null;
  /** Has this person signed in at least once (they have a profile)? */
  signedIn: boolean;
  managerEmail: string;
  /** From the payroll employee details; empty until an admin sets it. */
  department: string;
  joinedOn: string | null;
  seeded: boolean;
  isSelf: boolean;
};

export type AuditEntry = { id: number; actor: string; action: string; target: string; detail: string; at: string };

export type AccessData = {
  /** False until supabase/step24_access.sql has been run. */
  ready: boolean;
  rows: AccessRow[];
  audit: AuditEntry[];
  managers: { email: string; name: string }[];
  domains: string[];
};

const MISSING = new Set(["42P01", "PGRST205", "42703"]);

export async function loadAccess(): Promise<AccessData> {
  const me = await requireAdmin();
  const supabase = await db();
  const domains = allowedDomains();
  const [profiles, allowed, audit, details] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, status, removed_at, access_expires_on, last_login_at, manager_id").limit(5000),
    supabase.from("allowed_users").select("email, name, role, status, removed_at, expires_on, login_method, seeded").limit(5000),
    supabase.from("access_audit").select("id, actor_email, action, target, detail, created_at").order("created_at", { ascending: false }).limit(60),
    // Optional: before the payroll tables exist there are no departments, and that must not break this page.
    supabase.from("employee_details").select("user_id, department, joined_on").limit(5000),
  ]);
  const detailBy = new Map((details.error ? [] : details.data).map((d) => [d.user_id, d]));
  for (const r of [profiles, allowed, audit]) {
    if (r.error && MISSING.has(r.error.code ?? "")) return { ready: false, rows: [], audit: [], managers: [], domains };
    if (r.error) throw toError(r.error, "Couldn't load the access list. Please try again.");
  }

  const byEmail = new Map<string, AccessRow>();
  const emailOfId = new Map(profiles.data!.map((p) => [p.id, p.email.toLowerCase()]));
  for (const p of profiles.data!) {
    const email = p.email.toLowerCase();
    byEmail.set(email, {
      userId: p.id,
      email,
      name: p.full_name?.trim() || "",
      role: toRole(p.role) ?? "employee",
      type: "domain",
      loginMethod: null,
      status: p.status === "disabled" ? "disabled" : "active",
      removedAt: p.removed_at,
      expiresOn: p.access_expires_on,
      lastLogin: p.last_login_at,
      signedIn: true,
      managerEmail: p.manager_id ? (emailOfId.get(p.manager_id) ?? "") : "",
      department: detailBy.get(p.id)?.department ?? "",
      joinedOn: detailBy.get(p.id)?.joined_on ?? null,
      seeded: false,
      isSelf: p.id === me.id,
    });
  }
  for (const a of allowed.data!) {
    const row = byEmail.get(a.email);
    if (row) {
      row.type = "manual";
      row.removedAt = row.removedAt ?? a.removed_at;
      row.loginMethod = a.login_method === "password" ? "password" : "google";
      row.seeded = a.seeded;
      row.name = row.name || a.name || "";
    } else {
      byEmail.set(a.email, {
        userId: null,
        email: a.email,
        name: a.name ?? "",
        role: toRole(a.role) ?? "employee",
        type: "manual",
        loginMethod: a.login_method === "password" ? "password" : "google",
        status: a.status === "disabled" ? "disabled" : "active",
        removedAt: a.removed_at,
        expiresOn: a.expires_on,
        lastLogin: null,
        signedIn: false,
        managerEmail: "",
        department: "",
        joinedOn: null,
        seeded: a.seeded,
        isSelf: false,
      });
    }
  }
  // An on-domain person whose domain has since been removed from ALLOWED_DOMAINS can no longer sign in: show that.
  for (const row of byEmail.values()) {
    if (row.type === "domain" && !isAllowedDomain(row.email, domains)) row.type = "manual";
  }
  // A work address gives the name by itself, even before the person has signed in.
  for (const row of byEmail.values()) if (!row.name) row.name = nameFromEmail(row.email)?.full ?? "";
  const rows = [...byEmail.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  return {
    ready: true,
    rows,
    audit: audit.data!.map((e) => ({ id: e.id, actor: e.actor_email, action: e.action, target: e.target ?? "", detail: e.detail ?? "", at: e.created_at })),
    managers: rows.filter((r) => r.signedIn && (r.role === "manager" || r.role === "admin") && r.status === "active").map((r) => ({ email: r.email, name: r.name || r.email })),
    domains,
  };
}

function check<T>(parsed: { success: true; data: T } | { success: false; error: import("zod").ZodError }): T {
  if (!parsed.success) throw new TimesheetError(firstIssue(parsed.error));
  return parsed.data;
}

async function rpcError(error: { code?: string; message: string; details?: string | null } | null, fallback: string) {
  if (error) throw toError(error, fallback);
}

export async function addUser(input: AddUserInput): Promise<void> {
  await requireAdmin();
  const v = check(addUserSchema.safeParse(input));
  const supabase = await db();
  if (v.method === "password") {
    const { error } = await supabase.rpc("access_create_password_user", { p_email: v.email, p_name: v.name, p_role: v.role, p_password: v.password ?? "", p_expires: v.expiresOn || null });
    return rpcError(error, "Couldn't add the person. Please try again.");
  }
  const { error } = await supabase.rpc("access_add_user", { p_email: v.email, p_name: v.name, p_role: v.role, p_expires: v.expiresOn || null, p_method: "google", p_seeded: false, p_only_if_missing: false });
  return rpcError(error, "Couldn't add the person. Please try again.");
}

/** Add many people who sign in with Google. Returns how many were added and which ones failed (and why). */
export async function addMany(input: unknown): Promise<{ added: number; failed: string[] }> {
  await requireAdmin();
  const v = check(bulkSchema.safeParse(input));
  const supabase = await db();
  let added = 0;
  const failed: string[] = [];
  for (const p of v.people) {
    const { error } = await supabase.rpc("access_add_user", { p_email: p.email, p_name: p.name, p_role: p.role, p_expires: v.expiresOn || null, p_method: v.method, p_seeded: false, p_only_if_missing: false });
    if (error) failed.push(`${p.email}: ${toError(error, "couldn't be added").message}`);
    else added += 1;
  }
  return { added, failed };
}

export async function updateUser(input: unknown): Promise<void> {
  await requireAdmin();
  const v = check(updateUserSchema.safeParse(input));
  const supabase = await db();
  const { error } = await supabase.rpc("access_update_user", { p_email: v.email, p_role: v.role ?? null, p_status: v.status ?? null, p_expires: v.expiresOn || null, p_clear_expiry: v.clearExpiry ?? false });
  return rpcError(error, "Couldn't save the change. Please try again.");
}

export async function removeUser(email: string): Promise<void> {
  await requireAdmin();
  const e = check(emailSchema.safeParse(email));
  const supabase = await db();
  const { error } = await supabase.rpc("access_archive_user", { p_email: e });
  return rpcError(error, "Couldn't remove the person. Please try again.");
}

export async function restoreUser(email: string, mode: "fresh" | "retrieve"): Promise<void> {
  await requireAdmin();
  const e = check(emailSchema.safeParse(email));
  if (mode !== "fresh" && mode !== "retrieve") throw new TimesheetError("Choose Fresh start or Retrieve old data.");
  const supabase = await db();
  const { error } = await supabase.rpc("access_restore_user", { p_email: e, p_mode: mode });
  return rpcError(error, "Couldn't restore the person. Please try again.");
}

export async function resetPassword(input: unknown): Promise<void> {
  await requireAdmin();
  const v = check(resetPasswordSchema.safeParse(input));
  const supabase = await db();
  const { error } = await supabase.rpc("access_set_password", { p_email: v.email, p_password: v.password });
  return rpcError(error, "Couldn't reset the password. Please try again.");
}

export async function setManager(email: string, managerEmail: string): Promise<void> {
  await requireAdmin();
  const e = check(emailSchema.safeParse(email));
  const m = managerEmail ? check(emailSchema.safeParse(managerEmail)) : "";
  const supabase = await db();
  const { error } = await supabase.rpc("access_set_manager", { p_email: e, p_manager_email: m });
  return rpcError(error, "Couldn't set the manager. Please try again.");
}

/** An admin sets someone's name (for people whose email isn't on the company domain; the others get it from their email). */
export async function setPersonName(userId: string, first: string, last: string): Promise<void> {
  await requireAdmin();
  const name = [first, last].map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new TimesheetError("That person could not be found.");
  if (!name || name.length > 100) throw new TimesheetError("Enter a first name (and a last name if they have one), up to 100 characters in all.");
  const supabase = await db();
  const { error } = await supabase.rpc("admin_set_name" as never, { p_user: userId, p_name: name } as never);
  return rpcError(error, "Couldn't save the name. Please try again.");
}
