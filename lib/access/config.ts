// Who may sign in and what each role is. Plain code with no server-only imports, so the server, the browser and the
// tests can all use it. The database enforces the same rules (supabase/step24_access.sql); this is the app's copy.

export const ROLES = ["admin", "manager", "employee", "external", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", employee: "Employee", external: "External", viewer: "Viewer" };

/**
 * People who use the portal for their own work: timesheet, leave, expenses, duty. An External (someone who works with the company
 * but isn't on its staff) is one of them, with the same portal as an employee; a viewer only looks, and an admin runs the company.
 */
export const worksInPortal = (role: string | null | undefined): boolean => role === "employee" || role === "external" || role === "manager";

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** "ADMIN", "Manager", " viewer " all become a role; anything else is null. */
export function toRole(v: unknown): Role | null {
  const r = String(v ?? "").trim().toLowerCase();
  return isRole(r) ? r : null;
}

export const NO_ACCESS_ERROR = "You don't have access. Contact your admin.";

export const SIGN_IN_METHODS = ["google", "password"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** The domains whose Google accounts may sign in. From ALLOWED_DOMAINS (comma separated); vyntics.com when unset. */
export function parseDomains(raw: string | undefined | null): string[] {
  const list = String(raw ?? "")
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
  return [...new Set(list.length > 0 ? list : ["vyntics.com"])];
}

export const allowedDomains = (): string[] => parseDomains(process.env.ALLOWED_DOMAINS);

export function isAllowedDomain(email: string | null | undefined, domains: string[] = allowedDomains()): boolean {
  const at = String(email ?? "").trim().toLowerCase().split("@");
  return at.length === 2 && at[0].length > 0 && domains.includes(at[1]);
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normEmail = (v: string) => v.trim().toLowerCase();

/** How long a sign-in lasts before the person must sign in again (hours). SESSION_MAX_HOURS, 12 when unset. */
export function sessionMaxHours(raw: string | undefined = process.env.SESSION_MAX_HOURS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 24 * 30 ? n : 12;
}

export type BulkEntry = { email: string; name: string; role: Role };

/**
 * Read a pasted list or a CSV into people to add. Each line is "email", "email,name" or "email,name,role" (commas,
 * semicolons or tabs). A first line that says "email" is a header and is skipped. Bad lines are reported, not guessed.
 */
export function parseBulkUsers(text: string, defaultRole: Role = "employee", limit = 200): { entries: BulkEntry[]; errors: string[] } {
  const entries: BulkEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /^e-?mail$/i.test(cells[0])) return;
    const email = normEmail(cells[0] ?? "");
    if (!EMAIL_RE.test(email)) {
      errors.push(`Line ${i + 1}: "${cells[0] ?? ""}" isn't a valid email address.`);
      return;
    }
    const role = cells[2] ? toRole(cells[2]) : defaultRole;
    if (!role) {
      errors.push(`Line ${i + 1}: "${cells[2]}" isn't a role (admin, manager, employee or viewer).`);
      return;
    }
    if (seen.has(email)) return;
    seen.add(email);
    entries.push({ email, name: (cells[1] ?? "").slice(0, 100), role });
  });
  if (entries.length > limit) {
    errors.push(`Add up to ${limit} people at a time. This list has ${entries.length}.`);
    return { entries: [], errors };
  }
  return { entries, errors };
}
