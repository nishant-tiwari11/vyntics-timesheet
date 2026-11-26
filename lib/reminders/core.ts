// The rules behind the Google Chat reminders, as plain code with no database or network, so they can be tested.

export const DEFAULT_TEMPLATE = "Hi {name}, you have logged {hours} of {target} today. Please add your time log before you finish for the day.";

export type ChatSettings = {
  enabled: boolean;
  /** "HH:MM" in office time. The reminder is not sent before this. */
  reminderTime: string;
  template: string;
  weeklySummary: boolean;
  approvalDigest: boolean;
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enabled: false,
  reminderTime: "17:00",
  template: DEFAULT_TEMPLATE,
  weeklySummary: true,
  approvalDigest: true,
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TEMPLATE_MAX = 500;

/** "6" or "6.5", never "6.000000001". */
export function hoursText(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `${v}h`;
}

/** Fill {name}, {hours}, {target} and {remaining} in the admin's message. Unknown {words} are left as written. */
export function renderTemplate(template: string, vars: { name: string; hours: number; target: number }): string {
  const values: Record<string, string> = {
    name: vars.name,
    hours: hoursText(vars.hours),
    target: hoursText(vars.target),
    remaining: hoursText(Math.max(vars.target - vars.hours, 0)),
  };
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** Has the reminder time of day been reached? Both are "HH:MM" in office time. */
export function timeReached(now: string, reminderTime: string): boolean {
  return now >= reminderTime;
}

/** "HH:MM" right now in the office time zone. */
export function nowInOffice(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** The office-time calendar date of a moment, as YYYY-MM-DD. */
export function officeDateOf(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Was something already sent today (office time)? */
export function sentToday(lastSentAt: string | null | undefined, today: string): boolean {
  return !!lastSentAt && officeDateOf(lastSentAt) === today;
}

export type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  optedIn: boolean;
  lastSentAt: string | null;
};

/**
 * Who gets today's reminder: active people who can log time (not read-only viewers), who haven't switched reminders off,
 * who aren't on approved leave, who haven't already been reminded today, and who have logged less than the daily target.
 * Work from home does NOT skip a reminder: people working from home still log their hours.
 */
export function pickReminderRecipients(opts: {
  people: Person[];
  hoursById: Map<string, number>;
  onLeave: Set<string>;
  target: number;
  today: string;
}): { person: Person; hours: number }[] {
  const out: { person: Person; hours: number }[] = [];
  for (const person of opts.people) {
    if (person.role === "viewer" || !person.optedIn || !person.email) continue;
    if (opts.onLeave.has(person.id) || sentToday(person.lastSentAt, opts.today)) continue;
    const hours = opts.hoursById.get(person.id) ?? 0;
    if (hours < opts.target) out.push({ person, hours });
  }
  return out;
}

/** The week summary line: "You logged 36h of 40h this week (90%)." */
export function weekSummaryText(name: string, hours: number, target: number): string {
  const pct = target > 0 ? Math.round((hours / target) * 100) : 0;
  const tail = hours >= target ? "Target reached. Well done!" : `${hoursText(target - hours)} short of the target.`;
  return `Hi ${name}, your week: ${hoursText(hours)} logged of ${hoursText(target)} (${pct}%). ${tail}`;
}

/** The line sent to someone who went on duty and never went off: "Hi Asha, you went on duty at 09:30 on Wed 25 Nov and did not go off duty..." */
export function forgotDutyText(name: string, dateLabel: string, startTime: string): string {
  return `Hi ${name}, you went on duty at ${startTime} on ${dateLabel} and did not go off duty, so it was closed at midnight. Please add your time log for that day with the time you actually finished.`;
}

/** The approvals line for a manager or admin. */
export function approvalsText(name: string, n: { requests: number; logs: number; compOff: number }): string {
  const parts = [
    n.requests ? `${n.requests} leave or WFH request${n.requests === 1 ? "" : "s"}` : null,
    n.logs ? `${n.logs} time log${n.logs === 1 ? "" : "s"}` : null,
    n.compOff ? `${n.compOff} comp-off request${n.compOff === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "nothing");
  return `Hi ${name}, you have ${list} waiting for your approval.`;
}

/** Check what an admin typed on the settings form. Returns an error message, or null when fine. */
export function validateChatSettings(s: Pick<ChatSettings, "reminderTime" | "template">): string | null {
  if (!TIME_RE.test(s.reminderTime)) return "Enter the reminder time as hours and minutes, for example 17:00.";
  const t = s.template.trim();
  if (t.length === 0 || t.length > TEMPLATE_MAX) return `The message must be between 1 and ${TEMPLATE_MAX} characters.`;
  return null;
}
