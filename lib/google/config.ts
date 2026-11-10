import "server-only";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** The Google OAuth settings, or null when they haven't been filled in (the feature then stays switched off). */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !key) return null;
  return { clientId, clientSecret, redirectUri };
}
