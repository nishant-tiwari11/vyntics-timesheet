import "server-only";
import { ChatError, chatConfigured, sendChat, sendChatText, type ChatCard } from "@/lib/google-chat";
import { createServiceClient } from "@/lib/supabase/admin";
import { addDays, formatTime, formatYmd, mondayOf, todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import {
  DEFAULT_CHAT_SETTINGS,
  approvalsText,
  forgotDutyText,
  hoursText,
  nowInOffice,
  pickReminderRecipients,
  renderTemplate,
  sentToday,
  timeReached,
  weekSummaryText,
  type ChatSettings,
  type Person,
} from "./core";

export type Job = "reminder" | "summary" | "approvals" | "duty" | "threads";
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

type Row = Person & { fullName: string; managerId: string | null; reminded: string | null; summarised: string | null; digested: string | null };

/** The name of a person's own thread in the Chat space: all their reminders go into it. */
const threadOf = (userId: string) => `timesheet-${userId}`;

/**
 * One person's Google account ID, which is also their Google Chat user ID (read from their sign-in record; people who signed in
 * another way simply have none). Each person is looked up on their own: listing everyone at once fails for the whole list if a
 * single disabled account can't be read, and then nobody is tagged. Without an ID the card still goes out, naming the person.
 */
async function googleId(db: Db, userId: string): Promise<string | undefined> {
  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error) throw error;
    const g = data.user?.identities?.find((i) => i.provider === "google");
    const sub = String((g?.identity_data as { sub?: string } | undefined)?.sub ?? g?.id ?? "");
    return /^\d{5,30}$/.test(sub) ? sub : undefined;
  } catch (e) {
    logError("reminders: google id", e);
    return undefined;
  }
}

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
    fullName: (p.full_name as string | null)?.trim() || (p.email as string).split("@")[0],
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

/** Who already has a personal thread in the space (a "Thread started" note in the audit log), so the heading is posted only once. */
const THREAD_NOTE = "Thread started";
const WELCOME_NOTE = "Thread welcome";
async function loadMarks(db: Db, note: string): Promise<Set<string>> {
  const { data, error } = await db.from("access_audit").select("target").eq("action", "chat_reminder_sent").eq("detail", note).limit(5000);
  if (error) throw new Error(WRITE_FAILED);
  return new Set(data.map((r) => String(r.target)));
}

/**
 * Send one message into the person's own thread; a failure is recorded and never stops the others. The first time someone gets a
 * message, their thread is started with a heading ("VIPUL - TIMESHEET UPDATES") and their message goes in as a reply to it.
 * `column` is the profile stamp that says "sent today"; null for a message that must not use up another message's slot.
 */
async function deliver(
  db: Db,
  threads: Set<string>,
  who: { id: string; email: string; name: string },
  kind: string,
  card: ChatCard,
  column: "last_reminded_at" | "last_summary_at" | "last_digest_at" | null,
) {
  try {
    if (card.threadKey && !threads.has(who.email)) {
      await sendChatText(`${who.name.toUpperCase()} - TIMESHEET UPDATES`, card.threadKey);
      await new Promise((r) => setTimeout(r, 1100));
      await audit(db, "chat_reminder_sent", who.email, THREAD_NOTE);
      threads.add(who.email);
    }
    await sendChat(card);
    // Google Chat allows about one message a second into a space.
    await new Promise((r) => setTimeout(r, 1100));
    if (column) await stamp(db, who.id, column);
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

  // Start a personal thread for every employee and manager who doesn't have one yet. Safe to run again: it only adds the missing ones.
  if (job === "threads") {
    const [everyone, threads, welcomed] = await Promise.all([loadPeople(db), loadMarks(db, THREAD_NOTE), loadMarks(db, WELCOME_NOTE)]);
    const link = portalUrl("/timesheet/dashboard");
    const missing = everyone.filter((p) => (p.role === "employee" || p.role === "manager") && p.optedIn && p.email && (!threads.has(p.email) || !welcomed.has(p.email)));
    result.considered = missing.length;
    for (const p of missing) {
      try {
        if (!threads.has(p.email)) {
          await sendChatText(`${p.name.toUpperCase()} - TIMESHEET UPDATES`, threadOf(p.id));
          await new Promise((r) => setTimeout(r, 1100));
          await audit(db, "chat_reminder_sent", p.email, THREAD_NOTE);
          threads.add(p.email);
        }
        // A first reply, tagged, so the thread shows "1 reply", is easy to open, and the person knows it is theirs.
        if (!welcomed.has(p.email)) {
          await sendChat({
            title: "Your timesheet thread",
            subtitle: p.fullName,
            mention: await googleId(db, p.id),
            threadKey: threadOf(p.id),
            text: `Hi ${p.name}, this is your personal timesheet thread. Your reminders will appear here, and you can reply here too.`,
            link: link ? { url: link, label: "Open my timesheet" } : undefined,
          });
          await new Promise((r) => setTimeout(r, 1100));
          await audit(db, "chat_reminder_sent", p.email, WELCOME_NOTE);
        }
        result.sent++;
      } catch (e) {
        if (!(e instanceof ChatError)) logError("reminders: thread", e);
        await audit(db, "chat_reminder_failed", p.email, `${THREAD_NOTE}: ${e instanceof ChatError ? e.message : "Unexpected error."}`);
        result.failed++;
      }
    }
    return result;
  }

  const today = todayInOffice();
  const day = await dayContext(db, today);
  if (day.isOff) return skip("Today is a weekly off or a holiday.");
  const people = await loadPeople(db);
  const threads = await loadMarks(db, THREAD_NOTE);

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
      const card: ChatCard = {
        title: "Timesheet reminder",
        subtitle: (person as Row).fullName,
        mention: await googleId(db, person.id),
        threadKey: threadOf(person.id),
        fact: { label: "Logged today", value: `<b>${hoursText(hours)}</b> of ${hoursText(day.target)}`, icon: "CLOCK" },
        text,
        link: link ? { url: link, label: "Add time log" } : undefined,
      };
      if (await deliver(db, threads, person, `Daily reminder (${Math.round(hours * 100) / 100}h logged)`, card, "last_reminded_at")) result.sent++;
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
      const card: ChatCard = {
        title: "Your week in review",
        subtitle: p.fullName,
        mention: await googleId(db, p.id),
        threadKey: threadOf(p.id),
        fact: { label: "Logged this week", value: `<b>${hoursText(hours)}</b> of ${hoursText(weekTarget)}`, icon: "STAR" },
        text: weekSummaryText(p.name, hours, weekTarget),
        link: link ? { url: link, label: "Open my time logs" } : undefined,
      };
      if (await deliver(db, threads, p, `Weekly summary (${hours}h of ${weekTarget}h)`, card, "last_summary_at")) result.sent++;
      else result.failed++;
    }
    return result;
  }

  if (job === "duty") {
    // People who went on duty and never went off, in the last three days, who haven't logged that day. One message per forgotten
    // day, however many times the job runs: the message is recorded in the audit log and looked up before sending.
    const duty = await db
      .from("duty_logs" as never)
      .select("id, user_id, duty_date, started_at")
      .gte("duty_date", addDays(today, -3))
      .lt("duty_date", today)
      .or("ended_at.is.null,auto_closed.eq.true")
      .order("started_at", { ascending: false })
      .limit(500);
    if (duty.error) throw new Error(WRITE_FAILED);
    type Forgot = { id: string; user_id: string; duty_date: string; started_at: string };
    const latest = new Map<string, Forgot>();
    for (const d of (duty.data ?? []) as unknown as Forgot[]) if (!latest.has(d.user_id)) latest.set(d.user_id, d);
    if (latest.size === 0) return result;

    const [logs, sent] = await Promise.all([
      db.from("work_logs").select("user_id, log_date").in("user_id", [...latest.keys()]).in("log_date", [...new Set([...latest.values()].map((d) => d.duty_date))]).neq("status", "rejected").limit(5000),
      db.from("access_audit").select("target, detail").eq("action", "chat_reminder_sent").like("detail", "Forgot to go off duty%").limit(5000),
    ]);
    if (logs.error || sent.error) throw new Error(WRITE_FAILED);
    const logged = new Set(logs.data.map((l) => `${l.user_id}|${l.log_date}`));
    const told = new Set(sent.data.map((a) => `${a.target}|${a.detail}`));
    const byId = new Map(people.map((p) => [p.id, p]));
    const link = portalUrl("/timesheet/dashboard");
    for (const d of latest.values()) {
      const p = byId.get(d.user_id);
      if (!p || p.role === "viewer" || !p.optedIn || !p.email || logged.has(`${d.user_id}|${d.duty_date}`)) continue;
      const kind = `Forgot to go off duty (${d.id})`;
      if (told.has(`${p.email}|${kind}`)) continue;
      result.considered++;
      const dateLabel = formatYmd(d.duty_date, { weekday: "short", day: "numeric", month: "short" });
      const start = formatTime(d.started_at);
      const card: ChatCard = {
        title: "You didn't go off duty",
        subtitle: p.fullName,
        mention: await googleId(db, p.id),
        threadKey: threadOf(p.id),
        fact: { label: "Duty started", value: `<b>${dateLabel}</b> at ${start}`, icon: "CLOCK" },
        text: forgotDutyText(p.name, dateLabel, start),
        link: link ? { url: link, label: "Add time log" } : undefined,
      };
      if (await deliver(db, threads, p, kind, card, null)) result.sent++;
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
    const total = counts.requests + counts.logs + counts.compOff;
    const card: ChatCard = {
      title: "Approvals waiting",
      subtitle: p.fullName,
      threadKey: threadOf(p.id),
      fact: { label: "Waiting for your decision", value: `<b>${total}</b> item${total === 1 ? "" : "s"}`, icon: "DESCRIPTION" },
      text: approvalsText(p.name, counts),
      link: link ? { url: link, label: "Review" } : undefined,
    };
    if (await deliver(db, threads, p, `Pending approvals (${total})`, card, "last_digest_at")) result.sent++;
    else result.failed++;
  }
  return result;
}
