import "server-only";
import { ChatError, chatConfigured, sendChat } from "@/lib/google-chat";
import { createServiceClient } from "@/lib/supabase/admin";
import { addDays, mondayOf, todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import {
  DEFAULT_CHAT_SETTINGS,
  approvalsText,
  nowInOffice,
  pickReminderRecipients,
  renderTemplate,
  sentToday,
  timeReached,
  weekSummaryText,
  type ChatSettings,
  type Person,
} from "./core";

export type Job = "reminder" | "summary" | "approvals";
export type RunResult = { job: Job; skipped?: string; considered: number; sent: number; failed: number };

type Db = ReturnType<typeof createServiceClient>;

const WRITE_FAILED = "Couldn't read the data needed for reminders. Has supabase/step33_chat_reminders.sql been run?";

/** Monday = 1 ... Sunday = 7, for a YYYY-MM-DD date. */
const isoDay = (ymd: string) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The link to the portal, or null when the server doesn't know its own address (the message is then sent without a button). */
function portalUrl(path: string): string | undefined {
  const base = process.env.PORTAL_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return base ? `${base.replace(/\/+$/, "")}${path}` : undefined;
}

async function audit(db: Db, action: "chat_reminder_sent" | "chat_reminder_failed", email: string, detail: string) {
  try {
    const { error } = await db.from("access_audit").insert({ actor_id: null, actor_email: "system", action, target: email, detail: detail.slice(0, 300) });
    if (error) logError("reminders: audit", error);
  } catch (e) {
    logError("reminders: audit", e);
  }
}

async function loadSettings(db: Db): Promise<ChatSettings> {
  const { data, error } = await db.from("chat_settings").select("enabled, reminder_time, template, weekly_summary, approval_digest").eq("id", true).maybeSingle();
  if (error) throw new Error(WRITE_FAILED);
  if (!data) return DEFAULT_CHAT_SETTINGS;
  return { enabled: data.enabled, reminderTime: data.reminder_time, template: data.template, weeklySummary: data.weekly_summary, approvalDigest: data.approval_digest };
}

type Row = Person & { managerId: string | null; reminded: string | null; summarised: string | null; digested: string | null };

async function loadPeople(db: Db): Promise<Row[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, email, work_email, role, status, chat_reminders, last_reminded_at, last_summary_at, last_digest_at, manager_id")
    .eq("status", "active")
    .limit(2000);
  if (error) throw new Error(WRITE_FAILED);
  return data.map((p) => ({
    id: p.id as string,
    name: ((p.full_name as string | null)?.trim() || (p.email as string).split("@")[0]).split(" ")[0],
    email: ((p.work_email as string | null) || (p.email as string) || "").trim().toLowerCase(),
    role: p.role as string,
    optedIn: p.chat_reminders !== false,
    lastSentAt: null,
    managerId: (p.manager_id as string | null) ?? null,
    reminded: (p.last_reminded_at as string | null) ?? null,
    summarised: (p.last_summary_at as string | null) ?? null,
    digested: (p.last_digest_at as string | null) ?? null,
  }));
}

/** Everything a job needs that is the same for each person. null means "not a working day". */
async function dayContext(db: Db, today: string) {
  const [app, hol] = await Promise.all([
    db.from("app_settings").select("daily_target_hours, weekly_off_days").eq("id", true).maybeSingle(),
    db.from("holidays").select("id").eq("holiday_date", today).in("type", ["public", "festival"]).limit(1),
  ]);
  if (app.error || hol.error) throw new Error(WRITE_FAILED);
  const off: number[] = (app.data?.weekly_off_days as number[] | undefined) ?? [6, 7];
  const target = Number(app.data?.daily_target_hours ?? 8);
  const isOff = off.includes(isoDay(today)) || (hol.data?.length ?? 0) > 0;
  return { off, target, isOff };
}

async function stamp(db: Db, id: string, column: "last_reminded_at" | "last_summary_at" | "last_digest_at") {
  const { error } = await db.from("profiles").update({ [column]: new Date().toISOString() }).eq("id", id);
  if (error) logError("reminders: stamp", error);
}

/** Send one message; a failure is recorded and never stops the others. */
async function deliver(db: Db, who: { id: string; email: string }, kind: string, text: string, link: string | undefined, column: "last_reminded_at" | "last_summary_at" | "last_digest_at", label?: string) {
  try {
    await sendChat(who.email, text, link, label);
    // Google Chat allows about one message a second into a space.
    await new Promise((r) => setTimeout(r, 1100));
    await stamp(db, who.id, column);
    await audit(db, "chat_reminder_sent", who.email, kind);
    return true;
  } catch (e) {
    const why = e instanceof ChatError ? e.message : "Unexpected error.";
    if (!(e instanceof ChatError)) logError("reminders: send", e);
    await audit(db, "chat_reminder_failed", who.email, `${kind}: ${why}`);
    return false;
  }
}

export async function runJob(job: Job, now: Date = new Date()): Promise<RunResult> {
  const result: RunResult = { job, considered: 0, sent: 0, failed: 0 };
  const skip = (why: string): RunResult => ({ ...result, skipped: why });
  if (!chatConfigured()) return skip("Google Chat isn't set up (GOOGLE_CHAT_WEBHOOK_URL).");

  const db = createServiceClient();
  const settings = await loadSettings(db);
  if (!settings.enabled) return skip("Reminders are turned off.");

  const today = todayInOffice();
  const day = await dayContext(db, today);
  if (day.isOff) return skip("Today is a weekly off or a holiday.");
  const people = await loadPeople(db);

  if (job === "reminder") {
    if (!timeReached(nowInOffice(now), settings.reminderTime)) return skip(`Before the reminder time (${settings.reminderTime}).`);
    const [leave, logs] = await Promise.all([
      db.from("requests").select("user_id").eq("status", "approved").eq("type", "leave").lte("from_date", today).gte("to_date", today).limit(2000),
      db.from("work_logs").select("user_id, hours").eq("log_date", today).neq("status", "rejected").limit(10000),
    ]);
    if (leave.error || logs.error) throw new Error(WRITE_FAILED);
    const hoursById = new Map<string, number>();
    for (const l of logs.data) hoursById.set(l.user_id as string, (hoursById.get(l.user_id as string) ?? 0) + Number(l.hours ?? 0));
    const recipients = pickReminderRecipients({
      people: people.map((p) => ({ ...p, lastSentAt: p.reminded })),
      hoursById,
      onLeave: new Set(leave.data.map((r) => r.user_id as string)),
      target: day.target,
      today,
    });
    result.considered = recipients.length;
    const link = portalUrl("/timesheet/dashboard");
    for (const { person, hours } of recipients) {
      const text = renderTemplate(settings.template, { name: person.name, hours, target: day.target });
      if (await deliver(db, person, `Daily reminder (${Math.round(hours * 100) / 100}h logged)`, text, link, "last_reminded_at")) result.sent++;
      else result.failed++;
    }
    return result;
  }

  if (job === "summary") {
    if (isoDay(today) !== 5) return skip("The weekly summary is sent on Fridays.");
    if (!settings.weeklySummary) return skip("The Friday summary is turned off.");
    const monday = mondayOf(today);
    const weekTarget = day.target * Array.from({ length: 7 }, (_, i) => i + 1).filter((d) => !day.off.includes(d)).length;
    const logs = await db.from("work_logs").select("user_id, hours").gte("log_date", monday).lte("log_date", addDays(monday, 6)).neq("status", "rejected").limit(20000);
    if (logs.error) throw new Error(WRITE_FAILED);
    const hoursById = new Map<string, number>();
    for (const l of logs.data) hoursById.set(l.user_id as string, (hoursById.get(l.user_id as string) ?? 0) + Number(l.hours ?? 0));
    const recipients = people.filter((p) => p.role !== "viewer" && p.optedIn && p.email && !sentToday(p.summarised, today));
    result.considered = recipients.length;
    const link = portalUrl("/timesheet/worklog");
    for (const p of recipients) {
      const hours = Math.round((hoursById.get(p.id) ?? 0) * 100) / 100;
      if (await deliver(db, p, `Weekly summary (${hours}h of ${weekTarget}h)`, weekSummaryText(p.name, hours, weekTarget), link, "last_summary_at", "Open my time logs")) result.sent++;
      else result.failed++;
    }
    return result;
  }

  // approvals
  if (!settings.approvalDigest) return skip("Approval messages are turned off.");
  const [reqs, logs, comp] = await Promise.all([
    db.from("requests").select("user_id").eq("status", "pending").limit(5000),
    db.from("work_logs").select("user_id").eq("status", "pending").limit(10000),
    db.from("comp_off_requests").select("user_id").or("status.eq.pending,needs_reapproval.eq.true").limit(5000),
  ]);
  if (reqs.error || logs.error || comp.error) throw new Error(WRITE_FAILED);
  const owner = new Map(people.map((p) => [p.id, p]));
  const recipients = people.filter((p) => (p.role === "admin" || p.role === "manager") && p.optedIn && p.email && !sentToday(p.digested, today));
  result.considered = recipients.length;
  for (const p of recipients) {
    // An admin decides everything except their own; a manager decides for the people who report to them.
    const mine = (rows: { user_id: unknown }[]) => rows.filter((r) => r.user_id !== p.id && (p.role === "admin" || owner.get(r.user_id as string)?.managerId === p.id)).length;
    const counts = { requests: mine(reqs.data), logs: mine(logs.data), compOff: mine(comp.data) };
    if (counts.requests + counts.logs + counts.compOff === 0) continue;
    const link = portalUrl(p.role === "admin" ? "/timesheet/admin" : "/timesheet/team");
    if (await deliver(db, p, `Pending approvals (${counts.requests + counts.logs + counts.compOff})`, approvalsText(p.name, counts), link, "last_digest_at", "Review")) result.sent++;
    else result.failed++;
  }
  return result;
}
