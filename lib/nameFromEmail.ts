import { COMPANY_DOMAIN } from "./companyEmail";

const title = (s: string) => s.trim().toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * A name from a work email: "ved.sharma@vyntics.com" gives Ved Sharma; "ved@vyntics.com" gives just Ved. Any other domain
 * returns null (an admin types those names). Mirrors public.name_from_email in supabase/step35_onboarding.sql.
 */
export function nameFromEmail(email: string | null | undefined): { first: string; last: string; full: string } | null {
  const [local, domain, ...rest] = (email ?? "").trim().toLowerCase().split("@");
  if (!local || rest.length > 0 || domain !== COMPANY_DOMAIN) return null;
  const parts = local.split(".").filter(Boolean);
  if (parts.length === 0) return null;
  const first = title(parts[0].replace(/_/g, " "));
  const last = title(parts.slice(1).join(" ").replace(/_/g, " "));
  return { first, last, full: last ? `${first} ${last}` : first };
}

/** "Ved Sharma" gives first "Ved", last "Sharma" (everything after the first word). */
export function splitName(full: string): { first: string; last: string } {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

export const joinName = (first: string, last: string) => [first, last].map((s) => s.trim()).filter(Boolean).join(" ");
