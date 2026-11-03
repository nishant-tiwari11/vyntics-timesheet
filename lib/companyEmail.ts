// The one place the allowed company domain is defined. Nothing reads it from the browser.
const COMPANY_DOMAIN = "vyntics.com";

const COMPANY_EMAIL_RE = new RegExp(`^[^@\\s]+@${COMPANY_DOMAIN.replace(/\./g, "\\.")}$`);

export const COMPANY_EMAIL_ERROR = `Only @${COMPANY_DOMAIN} email addresses can use this portal.`;
export const COMPANY_EMAIL_HINT = `Use your @${COMPANY_DOMAIN} work email.`;

export function isCompanyEmail(email: string | null | undefined): boolean {
  return COMPANY_EMAIL_RE.test((email ?? "").trim().toLowerCase());
}
