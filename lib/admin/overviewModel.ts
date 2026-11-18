// The numbers and the list behind the Admin overview. Plain code with no server-only imports, so it can be tested on its own.

export type AttentionKind = "request" | "log" | "compoff" | "expense" | "document";

export type AttentionItem = {
  /** The id of the thing to decide (a request, time log, comp-off request, expense claim or document). */
  id: string;
  kind: AttentionKind;
  userId: string;
  who: string;
  /** "Leave", "Time log", "Comp-off", "Expense claim", "Document" with what it is. */
  title: string;
  detail: string;
  /** ISO time it was created, used to put the oldest-waiting first. */
  at: string;
  /** Approve and Reject can be done right in the list (otherwise there is a Review link). */
  inline: boolean;
  href: string;
};

/** The ones that have waited longest first, and at most `limit`. */
export function sortAttention(items: AttentionItem[], limit: number): AttentionItem[] {
  return [...items].sort((a, b) => a.at.localeCompare(b.at) || a.who.localeCompare(b.who)).slice(0, limit);
}

export type PersonRow = { id: string; role: string; status?: string | null };

/**
 * How many people have logged nothing today: active people who aren't read-only viewers, with no time logged and not on
 * approved leave. On a weekly off or a holiday nobody is expected to log, so it returns null.
 */
export function notLoggedToday(opts: { people: PersonRow[]; hoursById: ReadonlyMap<string, number>; onLeave: ReadonlySet<string>; dayOff: boolean }): number | null {
  if (opts.dayOff) return null;
  return opts.people.filter(
    (p) => p.role !== "viewer" && p.status !== "disabled" && !opts.onLeave.has(p.id) && (opts.hoursById.get(p.id) ?? 0) <= 0
  ).length;
}

/** "3 days ago", "2 h ago", "just now": how long something has been waiting. */
export function waiting(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}
