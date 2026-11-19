import "server-only";
import { google, type chat_v1 } from "googleapis";

// Sends a direct message from the portal's private Google Chat app to one person. The app signs in as a service account
// (GOOGLE_CHAT_SA_KEY: the key file's JSON, or that JSON in base64) and only ever runs on the server.
// The key is never logged and never sent to the browser.

const SCOPE = "https://www.googleapis.com/auth/chat.bot";

export class ChatError extends Error {}

let client: chat_v1.Chat | null = null;
/** Where each person's direct-message space is, kept while the server is warm so we ask Google once. */
const spaces = new Map<string, string>();

/** Is the Chat app set up on this server? */
export function chatConfigured(): boolean {
  return !!process.env.GOOGLE_CHAT_SA_KEY?.trim();
}

function credentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_CHAT_SA_KEY?.trim();
  if (!raw) throw new ChatError("Google Chat isn't set up on this server (GOOGLE_CHAT_SA_KEY is missing).");
  try {
    return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ChatError("GOOGLE_CHAT_SA_KEY isn't valid. Paste the service account key's JSON, or that JSON in base64.");
  }
}

function api(): chat_v1.Chat {
  if (!client) {
    const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: [SCOPE] });
    client = google.chat({ version: "v1", auth });
  }
  return client;
}

const statusOf = (e: unknown): number | undefined => {
  const err = e as { code?: number | string; status?: number; response?: { status?: number } } | null;
  const n = Number(err?.response?.status ?? err?.status ?? err?.code);
  return Number.isFinite(n) ? n : undefined;
};

/** A short, safe reason (no keys, no addresses of other people) for a failed Google call. */
function reason(e: unknown): string {
  if (e instanceof ChatError) return e.message;
  const status = statusOf(e);
  if (status === 401 || status === 403) return "Google refused the request. Check that the Chat app is installed for your organisation and that the service account is allowed.";
  if (status === 404) return "That person has no Chat conversation with the app yet.";
  if (status === 429) return "Google Chat is busy. Try again in a minute.";
  return "Google Chat couldn't deliver the message.";
}

async function spaceFor(email: string): Promise<string> {
  const cached = spaces.get(email);
  if (cached) return cached;
  const chat = api();
  try {
    const found = await chat.spaces.findDirectMessage({ name: `users/${email}` });
    if (found.data.name) {
      spaces.set(email, found.data.name);
      return found.data.name;
    }
  } catch (e) {
    // 404 means there is no conversation yet; anything else is a real problem.
    if (statusOf(e) !== 404) throw e;
  }
  // No conversation yet: open one.
  const created = await chat.spaces.setup({
    requestBody: { space: { spaceType: "DIRECT_MESSAGE" }, memberships: [{ member: { name: `users/${email}`, type: "HUMAN" } }] },
  });
  if (!created.data.name) throw new ChatError("Google Chat couldn't open a conversation with that person.");
  spaces.set(email, created.data.name);
  return created.data.name;
}

/**
 * Send `text` to the person with this work email as a direct message. With `linkUrl`, the message also carries an
 * "Add time log" button that opens that address. Throws a ChatError with a short, safe reason if it can't be delivered.
 */
export async function sendDM(email: string, text: string, linkUrl?: string, buttonLabel = "Add time log"): Promise<void> {
  const to = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ChatError("That person has no valid work email.");
  if (!text.trim()) throw new ChatError("The message is empty.");
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new ChatError("The link isn't a web address.");
  try {
    const parent = await spaceFor(to);
    await api().spaces.messages.create({
      parent,
      requestBody: {
        text,
        ...(linkUrl
          ? {
              cardsV2: [
                {
                  cardId: "timesheet-link",
                  card: {
                    sections: [{ widgets: [{ buttonList: { buttons: [{ text: buttonLabel, onClick: { openLink: { url: linkUrl } } }] } }] }],
                  },
                },
              ],
            }
          : {}),
      },
    });
  } catch (e) {
    // A stale space (the person removed the app) is looked up again next time.
    spaces.delete(to);
    throw new ChatError(reason(e));
  }
}
