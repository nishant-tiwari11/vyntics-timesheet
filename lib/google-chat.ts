import "server-only";

// Posts a message into the team's Google Chat space through an incoming webhook (GOOGLE_CHAT_WEBHOOK_URL). The message
// @mentions the person it is for, so they get a notification. No Google Cloud project or service account is needed.
// The webhook address contains a secret key: it lives only in the server's environment and is never logged or sent to the browser.

export class ChatError extends Error {}

const HOOK_HOST = "chat.googleapis.com";

/** Is the Chat space connected on this server? */
export function chatConfigured(): boolean {
  return webhook() !== null;
}

function webhook(): URL | null {
  const raw = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Only ever post to Google Chat, whatever is typed into the setting.
    return url.protocol === "https:" && url.hostname === HOOK_HOST ? url : null;
  } catch {
    return null;
  }
}

/**
 * Post a message to the Chat space, starting with an @mention of the person with this work email. With `linkUrl`, the message
 * also carries a button that opens that address. Throws a ChatError with a short, safe reason if it can't be delivered.
 */
export async function sendChat(email: string, text: string, linkUrl?: string, buttonLabel = "Add time log"): Promise<void> {
  const url = webhook();
  if (!url) throw new ChatError("Google Chat isn't set up on this server (GOOGLE_CHAT_WEBHOOK_URL is missing or isn't a Google Chat address).");
  const to = email.trim().toLowerCase();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(to)) throw new ChatError("That person has no valid work email.");
  if (!text.trim()) throw new ChatError("The message is empty.");
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new ChatError("The link isn't a web address.");

  const body = {
    text: `<users/${to}> ${text}`,
    ...(linkUrl
      ? {
          cardsV2: [
            {
              cardId: "timesheet-link",
              card: { sections: [{ widgets: [{ buttonList: { buttons: [{ text: buttonLabel, onClick: { openLink: { url: linkUrl } } }] } }] }] },
            },
          ],
        }
      : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ChatError("Couldn't reach Google Chat.");
  }
  if (res.ok) return;
  if (res.status === 429) throw new ChatError("Google Chat is busy. Try again in a minute.");
  if (res.status === 400 || res.status === 404) throw new ChatError("Google Chat refused the message. Check that the webhook address is still valid.");
  if (res.status === 401 || res.status === 403) throw new ChatError("Google Chat rejected the webhook's key. Create a new webhook and update the address.");
  throw new ChatError("Google Chat couldn't deliver the message.");
}
