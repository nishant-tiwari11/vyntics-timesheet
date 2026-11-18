// People who may sign in even though they are not on a company domain, and extra password accounts.
// `npm run seed:users` copies these into the database. It only ADDS people who aren't there yet, so changes an admin
// makes on Admin -> Access (role, disabling, expiry) are never overwritten by running it again.
//
// Anyone on a company domain (ALLOWED_DOMAINS, default vyntics.com) can already sign in with Google and needs no entry.
// Roles: ADMIN, MANAGER, EMPLOYEE, VIEWER (VIEWER is read-only).

export type SeedUser = {
  email: string;
  name?: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";
  /** How they sign in. Google unless you say "password" (then an admin sets their password on Admin -> Access). */
  method?: "google" | "password";
  /** Optional last day of access, "YYYY-MM-DD". */
  expiresOn?: string;
};

// Add your own people here. Left empty on purpose: every address listed here gets access when you run the seed.
// Example:
//   { email: "partner@gmail.com", name: "A Partner", role: "EMPLOYEE" },
//   { email: "client@abc.com", name: "A Client", role: "VIEWER", expiresOn: "2026-12-31" },
export const ALLOWED_USERS: SeedUser[] = [];

// Accounts that sign in with an email and a password that you keep in the environment, never in this file.
// Each entry names two environment variables; the account is created (or its password updated) when both are set.
export type SeedPasswordUser = {
  emailEnv: string;
  passwordEnv: string;
  name: string;
  role: SeedUser["role"];
};

export const PASSWORD_USERS: SeedPasswordUser[] = [
  // An emergency admin who can still get in if Google sign-in is down. Set both in .env.local (the password: 10+ characters).
  { emailEnv: "EMERGENCY_ADMIN_EMAIL", passwordEnv: "EMERGENCY_ADMIN_PASSWORD", name: "Emergency admin", role: "ADMIN" },
];
