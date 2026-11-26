import "server-only";

// Posts a card into the team's Google Chat space through an incoming webhook (GOOGLE_CHAT_WEBHOOK_URL). No Google Cloud
// project or service account is needed.
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

export type ChatCard = {
  /** The card's heading, e.g. "Timesheet reminder". */
  title: string;
  /** Under the heading: who this is for. */
  subtitle: string;
  /** One highlighted fact, e.g. "Logged today" / "0h of 8h". Basic <b> tags are allowed in the value. */
  fact?: { label: string; value: string; icon?: "CLOCK" | "PERSON" | "DESCRIPTION" | "STAR" | "BOOKMARK" };
  /** The message itself. */
  text: string;
  /** A button under the message that opens this address. */
  link?: { url: string; label: string };
  /** The person's Google account ID (digits). When given, the message really @mentions them and they are notified. */
  mention?: string;
  /**
   * A name for this person's own thread. Every message with the same key lands in the same thread in the space, so each person
   * has one personal thread with all their reminders. (If the space doesn't use threads, the message is posted as normal.)
   */
  threadKey?: string;
};

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The webhook address, aimed at one person's thread when a (safe) thread key is given. Throws when Chat isn't set up. */
function hookFor(threadKey?: string): URL {
  const url = webhook();
  if (!url) throw new ChatError("Google Chat isn't set up on this server (GOOGLE_CHAT_WEBHOOK_URL is missing or isn't a Google Chat address).");
  if (threadKey && /^[\w-]{1,200}$/.test(threadKey)) {
    url.searchParams.set("threadKey", threadKey);
    url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
  }
  return url;
}

async function post(url: URL, body: unknown): Promise<void> {
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

/** A plain text message, used to start a person's thread ("VIPUL - TIMESHEET UPDATES"). Later messages with the same key reply to it. */
export async function sendChatText(text: string, threadKey: string): Promise<void> {
  if (!text.trim()) throw new ChatError("The message is empty.");
  await post(hookFor(threadKey), { text });
}

/**
 * Post a message and a card to the Chat space. With `mention`, the message starts with a real @mention of the person (Google
 * only accepts a numeric ID there); without one, the person is named in the card instead. Throws a ChatError with a short,
 * safe reason if it can't be delivered.
 */
export async function sendChat(card: ChatCard): Promise<void> {
  const url = hookFor(card.threadKey);
  if (!card.text.trim()) throw new ChatError("The message is empty.");
  if (card.link && !/^https?:\/\//i.test(card.link.url)) throw new ChatError("The link isn't a web address.");

  const widgets: unknown[] = [];
  if (card.fact) {
    widgets.push({ decoratedText: { topLabel: card.fact.label, text: card.fact.value, startIcon: { knownIcon: card.fact.icon ?? "CLOCK" } } });
  }
  const mention = card.mention && /^\d{5,30}$/.test(card.mention) ? card.mention : null;
  // With a mention the sentence is the message itself (that is what notifies the person), so the card doesn't repeat it.
  if (!mention) widgets.push({ textParagraph: { text: escapeHtml(card.text) } });
  if (card.link) widgets.push({ buttonList: { buttons: [{ text: card.link.label, onClick: { openLink: { url: card.link.url } } }] } });

  const body = {
    // Shown in notifications and wherever cards can't be drawn.
    text: mention ? `<users/${mention}> ${card.text}` : `${card.title}: ${card.subtitle}`,
    cardsV2: [{ cardId: "timesheet", card: { header: { title: card.title, subtitle: card.subtitle }, sections: [{ widgets }] } }],
  };

  await post(url, body);
}
