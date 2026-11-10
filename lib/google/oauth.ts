import "server-only";
import { GOOGLE_SCOPE, googleConfig } from "./config";
import { GoogleError, googleFetch } from "./http";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

function need() {
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("Google Calendar isn't set up yet.", 0);
  return cfg;
}

/** The Google consent-screen address. `access_type=offline` + `prompt=consent` is what makes Google hand out a refresh token. */
export function authUrl(state: string, loginHint?: string): string {
  const cfg = need();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await googleFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    // invalid_grant = the refresh token was revoked or has expired.
    throw new GoogleError(json.error_description ?? json.error ?? "Google refused the request.", res.status, json.error === "invalid_grant");
  }
  return json;
}

/** Trade the one-time code from the consent screen for tokens. */
export async function exchangeCode(code: string) {
  const cfg = need();
  return tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
}

/** A fresh short-lived access token from the stored refresh token. Never stored. */
export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const cfg = need();
  const json = await tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  return json.access_token as string;
}

/** Ask Google to forget the grant. Best effort: failing to reach Google must not block disconnecting. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await googleFetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }, 1);
  } catch {}
}
