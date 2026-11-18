// Small helpers for the notification bell. Plain code with no server-only imports, so the browser and the tests can use it.

/** "just now", "5 min ago", "3 h ago", "Yesterday", or a date such as "12 Nov". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: new Date(then).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric", timeZone: "Asia/Kolkata" }).format(then);
}

export type Tone = "good" | "bad" | "warn" | "info";

/** Which little symbol goes next to a notification, from its title ("Leave approved", "Document rejected", ...). */
export function toneOf(title: string): Tone {
  const t = title.toLowerCase();
  if (/reject|denied|declin/.test(t)) return "bad";
  if (/approved|verified|reimbursed|ready|updated/.test(t)) return "good";
  if (/expir|missing|please|waiting|upload/.test(t)) return "warn";
  return "info";
}
