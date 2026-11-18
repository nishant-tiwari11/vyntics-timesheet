import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NO_ACCESS_ERROR, ROLES, isAllowedDomain, parseBulkUsers, parseDomains, sessionMaxHours, toRole } from "@/lib/access/config";
import { addUserSchema, bulkSchema, resetPasswordSchema } from "@/lib/access/schemas";
import { ALLOWED_USERS, PASSWORD_USERS } from "@/config/allowed-users";

describe("allowed domains", () => {
  it("defaults to vyntics.com and reads a comma separated list", () => {
    expect(parseDomains(undefined)).toEqual(["vyntics.com"]);
    expect(parseDomains("")).toEqual(["vyntics.com"]);
    expect(parseDomains("vyntics.com, Partner.co.in ;@client.org")).toEqual(["vyntics.com", "partner.co.in", "client.org"]);
    expect(parseDomains("not a domain, vyntics.com")).toEqual(["vyntics.com"]);
  });

  it("matches the whole domain, not just the end of the address", () => {
    const d = ["vyntics.com"];
    expect(isAllowedDomain("a@vyntics.com", d)).toBe(true);
    expect(isAllowedDomain("A@Vyntics.com ", d)).toBe(true);
    expect(isAllowedDomain("a@evil-vyntics.com", d)).toBe(false);
    expect(isAllowedDomain("a@vyntics.com.evil.io", d)).toBe(false);
    expect(isAllowedDomain("a@b@vyntics.com", d)).toBe(false);
    expect(isAllowedDomain("@vyntics.com", d)).toBe(false);
    expect(isAllowedDomain(null, d)).toBe(false);
  });

  it("says what people see when turned away", () => {
    expect(NO_ACCESS_ERROR).toBe("You don't have access. Contact your admin.");
  });
});

describe("roles", () => {
  it("has the four roles and reads them in any case", () => {
    expect(ROLES).toEqual(["admin", "manager", "employee", "viewer"]);
    expect(toRole("VIEWER")).toBe("viewer");
    expect(toRole(" Manager ")).toBe("manager");
    expect(toRole("owner")).toBeNull();
    expect(toRole(undefined)).toBeNull();
  });
});

describe("session length", () => {
  it("is 12 hours unless a sensible number is set", () => {
    expect(sessionMaxHours(undefined)).toBe(12);
    expect(sessionMaxHours("8")).toBe(8);
    expect(sessionMaxHours("0")).toBe(12);
    expect(sessionMaxHours("abc")).toBe(12);
    expect(sessionMaxHours("999999")).toBe(12);
  });
});

describe("bulk add", () => {
  it("reads emails, names and roles, skips a header and duplicates", () => {
    const { entries, errors } = parseBulkUsers("email,name,role\nPartner@Gmail.com,A Partner,employee\nclient@abc.com;Client;VIEWER\npartner@gmail.com\nplain@x.io", "manager");
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { email: "partner@gmail.com", name: "A Partner", role: "employee" },
      { email: "client@abc.com", name: "Client", role: "viewer" },
      { email: "plain@x.io", name: "", role: "manager" },
    ]);
  });

  it("reports bad lines instead of guessing", () => {
    const { entries, errors } = parseBulkUsers("good@x.io\nnot-an-email\nbad@x.io,Bad,boss");
    expect(entries.map((e) => e.email)).toEqual(["good@x.io"]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("Line 2");
    expect(errors[1]).toContain("boss");
  });

  it("refuses an enormous list", () => {
    const big = Array.from({ length: 201 }, (_, i) => `u${i}@x.io`).join("\n");
    expect(parseBulkUsers(big).entries).toEqual([]);
  });
});

describe("admin form checks (zod)", () => {
  it("needs a real password for a password account", () => {
    expect(addUserSchema.safeParse({ email: "a@x.io", role: "employee", method: "password", password: "short" }).success).toBe(false);
    expect(addUserSchema.safeParse({ email: "a@x.io", role: "employee", method: "password", password: "long-enough-1" }).success).toBe(true);
    expect(addUserSchema.safeParse({ email: "a@x.io", role: "employee", method: "google" }).success).toBe(true);
  });

  it("refuses an unknown role, a bad email and a bad date", () => {
    expect(addUserSchema.safeParse({ email: "a@x.io", role: "owner", method: "google" }).success).toBe(false);
    expect(addUserSchema.safeParse({ email: "nope", role: "viewer", method: "google" }).success).toBe(false);
    expect(addUserSchema.safeParse({ email: "a@x.io", role: "viewer", method: "google", expiresOn: "tomorrow" }).success).toBe(false);
  });

  it("normalises the email and limits password length (bcrypt stops at 72 bytes)", () => {
    const ok = resetPasswordSchema.parse({ email: " Person@X.io ", password: "a-long-password" });
    expect(ok.email).toBe("person@x.io");
    expect(resetPasswordSchema.safeParse({ email: "a@x.io", password: "x".repeat(73) }).success).toBe(false);
    expect(bulkSchema.safeParse({ people: [] }).success).toBe(false);
  });
});

describe("seed config", () => {
  it("lists no one by default and keeps passwords out of the file", () => {
    expect(ALLOWED_USERS).toEqual([]);
    for (const p of PASSWORD_USERS) {
      expect(p.emailEnv).toMatch(/^[A-Z_]+$/);
      expect(p.passwordEnv).toMatch(/^[A-Z_]+$/);
    }
    const source = fs.readFileSync(path.resolve(__dirname, "../config/allowed-users.ts"), "utf8");
    expect(source).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);
  });
});

// The rules that decide who gets in live in the database, so check the migration still spells them out.
describe("access migration", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/step24_access.sql"), "utf8");
  const roles = fs.readFileSync(path.resolve(__dirname, "../supabase/step24a_roles.sql"), "utf8");

  it("adds the two roles in their own step", () => {
    expect(roles).toMatch(/add value if not exists 'manager'/);
    expect(roles).toMatch(/add value if not exists 'viewer'/);
  });

  it("only lets a company-domain Google account or a listed person in, and refuses disabled or expired ones", () => {
    expect(sql).toMatch(/split_part\(e, '@', 2\) = any/);
    expect(sql).toMatch(/return 'disabled'/);
    expect(sql).toMatch(/return 'expired'/);
    expect(sql).toMatch(/Accounts can only be created with Google sign-in, or by an admin/);
  });

  it("stores passwords as bcrypt hashes and never writes them to the audit log", () => {
    expect(sql).toMatch(/extensions\.crypt\(p_password, extensions\.gen_salt\('bf'/);
    expect(sql).toMatch(/the password is never recorded|the value is never recorded/);
    expect(sql).not.toMatch(/access_audit_write\([^)]*p_password/);
  });

  it("locks an account for 15 minutes after 5 wrong passwords", () => {
    expect(sql).toMatch(/offset 4 limit 1/);
    expect(sql).toMatch(/interval '15 minutes'/);
    expect(sql).toMatch(/banned_until = now\(\)/);
  });

  it("makes viewers read-only on every table people write to, and lets managers only read", () => {
    expect(sql).toMatch(/as restrictive for insert[\s\S]*not public\.is_viewer\(\)/);
    expect(sql).toMatch(/as restrictive for update/);
    expect(sql).toMatch(/as restrictive for delete/);
    expect(sql).toMatch(/managers read team', t\);[\s\S]*for select/);
    expect(sql).not.toMatch(/managers[^;]*for (insert|update|delete)/i);
  });

  it("always keeps one active admin, and keeps a removed person's data", () => {
    expect(sql).toMatch(/There must be at least one active admin/);
    expect(sql).toMatch(/update public\.profiles set status = 'disabled'/);
    expect(sql).not.toMatch(/delete from public\.profiles/);
  });

  it("gives no one write access to the access tables except through the functions", () => {
    expect(sql).not.toMatch(/create policy "allowed users: admin (write|insert|update|delete)/);
    expect(sql).toMatch(/grant execute on function public\.access_login_locked\(text, text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.access_set_password\(text, text\) to anon/);
  });
});
