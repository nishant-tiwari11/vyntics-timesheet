// npm run seed:users
// Copies the settings in config/allowed-users.ts and your environment into the database:
//   * ALLOWED_DOMAINS            -> which company domains may sign in with Google
//   * ALLOWED_USERS              -> extra people (added only if they aren't there yet)
//   * INITIAL_ADMIN_EMAIL        -> that person is an admin (made one if there is no admin yet)
//   * EMERGENCY_ADMIN_EMAIL/PASSWORD (see PASSWORD_USERS) -> a password account, created or its password updated
// It needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service key is a secret: keep it only in
// .env.local (never commit it, never put it in a NEXT_PUBLIC_ variable). Passwords are never printed.
// Safe to run again: nothing an admin changed on the Access page is overwritten.
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_USERS, PASSWORD_USERS } from "../config/allowed-users.ts";
import { parseDomains, toRole } from "../lib/access/config.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let problems = 0;
const fail = (what, error) => {
  problems += 1;
  console.error(`  x ${what}: ${error?.message ?? error}`);
};

async function addUser(person, { onlyIfMissing }) {
  const role = toRole(person.role);
  if (!role) return fail(person.email, `"${person.role}" isn't a role`);
  const { error } = await db.rpc("access_add_user", {
    p_email: person.email,
    p_name: person.name ?? "",
    p_role: role,
    p_expires: person.expiresOn ?? null,
    p_method: person.method ?? "google",
    p_seeded: true,
    p_only_if_missing: onlyIfMissing,
  });
  if (error) fail(person.email, error);
  else console.log(`  ok ${person.email} (${role})`);
}

console.log("Domains");
const domains = parseDomains(process.env.ALLOWED_DOMAINS);
{
  const { error } = await db.from("access_settings").update({ allowed_domains: domains, updated_at: new Date().toISOString() }).eq("singleton", true);
  if (error) fail("allowed domains", error);
  else console.log(`  ok ${domains.map((d) => `@${d}`).join(", ")}`);
}

console.log("Allowed users");
if (ALLOWED_USERS.length === 0) console.log("  (none listed in config/allowed-users.ts)");
for (const person of ALLOWED_USERS) await addUser(person, { onlyIfMissing: true });

console.log("Initial admin");
const initial = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!initial) {
  console.log("  (INITIAL_ADMIN_EMAIL isn't set)");
} else {
  await addUser({ email: initial, role: "ADMIN" }, { onlyIfMissing: true });
  // If they already have an account but there is no admin at all, make them one. An existing admin is never changed.
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
  if ((count ?? 0) === 0) {
    const { error } = await db.rpc("access_update_user", { p_email: initial, p_role: "admin", p_status: "active", p_expires: null, p_clear_expiry: false });
    if (error) fail("making the initial admin an admin", error);
  }
}

console.log("Password accounts");
let any = false;
for (const p of PASSWORD_USERS) {
  const email = (process.env[p.emailEnv] ?? "").trim().toLowerCase();
  const password = process.env[p.passwordEnv] ?? "";
  if (!email || !password) continue;
  any = true;
  const { error } = await db.rpc("access_create_password_user", { p_email: email, p_name: p.name, p_role: toRole(p.role) ?? "employee", p_password: password, p_expires: null });
  if (error) fail(email, error);
  else console.log(`  ok ${email} (${p.role}, password from ${p.passwordEnv})`);
}
if (!any) console.log("  (no password accounts: set the variables named in PASSWORD_USERS to add one)");

console.log(problems === 0 ? "\nDone." : `\nDone with ${problems} problem${problems === 1 ? "" : "s"}.`);
process.exit(problems === 0 ? 0 : 1);
