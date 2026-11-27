import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/avatar";
import { db, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { todayInOffice } from "@/lib/timesheet/dates";
import { safeFileName } from "@/lib/expenses/billFile";
import type { BoardCard } from "./board";
import { FILE_MAX_BYTES, FILES_PER_TICKET, FILE_TYPES_TEXT, isPriority, isStatus, mentionIds, sniffFile, type Person, type Priority, type Status, type TicketRow } from "./model";

// Tickets. The person is always the signed-in one (from the session), and what they may see or change is decided by the database
// (supabase/step45_tickets.sql): reads go through row-level security, every change through a function that checks the workflow.

const BUCKET = "ticket-files";
const NOT_SET_UP = "Tickets aren't set up yet. Ask an admin to run step 45.";
const PAGE_SIZE = 25;

type Client = Awaited<ReturnType<typeof db>>;
// The ticket tables aren't in the generated types, so they are reached through these two small helpers.
const from = (c: Client, table: string) => c.from(table as never);
const rpc = async <T>(c: Client, fn: string, args: Record<string, unknown>, fallback: string): Promise<T> => {
  const { data, error } = await c.rpc(fn as never, args as never);
  if (error) throw /function|does not exist|schema cache|relation/i.test(error.message) && error.code !== "P0001" ? new TimesheetError(NOT_SET_UP) : toError(error, fallback);
  return data as T;
};
const missing = (e: { message: string; code?: string }) => e.code !== "P0001" && /relation|does not exist|schema cache/i.test(e.message);
const assertId = (id: string, what: string) => {
  if (!isUuid(id)) throw new TimesheetError(`That ${what} could not be found.`);
};

// ---------- Categories ----------
export type Category = { id: string; name: string; department: string; sensitive: boolean };

export async function listCategories(): Promise<Category[]> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await from(supabase, "ticket_categories").select("id, name, department, sensitive").eq("active", true).order("sort");
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, "Couldn't load the categories.");
  return data as unknown as Category[];
}

// ---------- People ----------
async function peopleMap(supabase: Client, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((i): i is string => !!i))];
  const map = new Map<string, string>();
  if (list.length === 0) return map;
  const { data } = await supabase.rpc("ticket_people" as never, { p_ids: list } as never);
  for (const p of (data ?? []) as unknown as { id: string; name: string }[]) map.set(p.id, p.name);
  return map;
}

// ---------- Lists ----------
export type Scope = "mine" | "assigned" | "all";
export type SortKey = "newest" | "oldest" | "updated" | "due";
export type ListQuery = { scope: Scope; q?: string; status?: string; priority?: string; category?: string; from?: string; to?: string; sort?: SortKey; page?: number };
export type TicketList = { rows: (TicketRow & { raisedByName: string; assigneeName: string | null })[]; total: number; page: number; pages: number };

const SELECT =
  "id, number, subject, status, priority, department, due_on, created_at, updated_at, raised_by, assignee_id, category_id, ticket_categories(name), ticket_comments(count), ticket_attachments(count)";

type DbTicket = {
  id: string; number: number; subject: string; status: string; priority: string; department: string; due_on: string | null; created_at: string; updated_at: string;
  raised_by: string; assignee_id: string | null; category_id: string;
  ticket_categories: { name: string } | { name: string }[] | null; ticket_comments: { count: number }[] | null; ticket_attachments: { count: number }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function toRow(r: DbTicket): TicketRow {
  return {
    id: r.id,
    number: r.number,
    subject: r.subject,
    status: isStatus(r.status) ? r.status : "open",
    priority: isPriority(r.priority) ? r.priority : "medium",
    department: r.department,
    category: one(r.ticket_categories)?.name ?? "",
    raisedBy: r.raised_by,
    assigneeId: r.assignee_id,
    dueOn: r.due_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    comments: r.ticket_comments?.[0]?.count ?? 0,
    attachments: r.ticket_attachments?.[0]?.count ?? 0,
  };
}

/** Tickets for one of the three lists. Which ones come back is decided by the database's row rules, not by the filters here. */
export async function listTickets(query: ListQuery): Promise<TicketList> {
  const me = await requireUser();
  const supabase = await db();
  const page = Math.max(1, Math.floor(query.page ?? 1));
  let q = from(supabase, "tickets").select(SELECT, { count: "exact" });
  if (query.scope === "mine") q = q.eq("raised_by", me.id);
  if (query.scope === "assigned") q = q.eq("assignee_id", me.id);
  if (isStatus(query.status)) q = q.eq("status", query.status);
  if (isPriority(query.priority)) q = q.eq("priority", query.priority);
  if (query.category && isUuid(query.category)) q = q.eq("category_id", query.category);
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) q = q.gte("created_at", `${query.from}T00:00:00+05:30`);
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) q = q.lte("created_at", `${query.to}T23:59:59+05:30`);
  const text = (query.q ?? "").trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (text) q = q.ilike("subject", `%${text}%`);
  const sort = query.sort ?? "newest";
  q = sort === "oldest" ? q.order("created_at", { ascending: true }) : sort === "updated" ? q.order("updated_at", { ascending: false }) : sort === "due" ? q.order("due_on", { ascending: true, nullsFirst: false }) : q.order("created_at", { ascending: false });
  const { data, error, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, "Couldn't load the tickets. Please try again.");
  const rows = (data as unknown as DbTicket[]).map(toRow);
  const names = await peopleMap(supabase, rows.flatMap((r) => [r.raisedBy, r.assigneeId]));
  const total = count ?? rows.length;
  return {
    rows: rows.map((r) => ({ ...r, raisedByName: names.get(r.raisedBy) ?? "Unknown", assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? "Unknown") : null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type Summary = { total: number; open: number; inProgress: number; pendingReview: number; resolved: number; overdue: number };

/** The numbers on the cards for one list. */
export async function ticketSummary(scope: Scope): Promise<Summary> {
  const me = await requireUser();
  const supabase = await db();
  let q = from(supabase, "tickets").select("status, due_on");
  if (scope === "mine") q = q.eq("raised_by", me.id);
  if (scope === "assigned") q = q.eq("assignee_id", me.id);
  const { data, error } = await q.limit(5000);
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, "Couldn't load the tickets. Please try again.");
  const today = todayInOffice();
  const s: Summary = { total: 0, open: 0, inProgress: 0, pendingReview: 0, resolved: 0, overdue: 0 };
  for (const r of data as unknown as { status: string; due_on: string | null }[]) {
    s.total++;
    if (r.status === "open" || r.status === "reopened" || r.status === "assigned") s.open++;
    if (r.status === "in_progress" || r.status === "on_hold") s.inProgress++;
    if (r.status === "pending_review") s.pendingReview++;
    if (r.status === "resolved" || r.status === "closed") s.resolved++;
    if (r.due_on && r.due_on < today && r.status !== "resolved" && r.status !== "closed") s.overdue++;
  }
  return s;
}

// ---------- One ticket ----------
export type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  priority: Priority;
  department: string;
  category: string;
  sensitive: boolean;
  project: string | null;
  workLogId: string | null;
  workLog: { date: string; start: string | null; end: string | null; project: string | null; hours: number } | null;
  dueOn: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  raisedBy: Person;
  assignee: Person | null;
  followers: Person[];
  /** What the signed-in person is to this ticket, which decides what the drawer lets them do. */
  me: { id: string; raiser: boolean; staff: boolean; admin: boolean; following: boolean };
  comments: { id: string; author: Person; body: string; internal: boolean; createdAt: string }[];
  attachments: { id: string; name: string; mime: string; size: number; screenshot: boolean; by: string; createdAt: string }[];
  subtasks: { id: string; title: string; done: boolean }[];
  history: { id: string; from: string | null; to: string; by: string; note: string | null; at: string }[];
  activity: { id: string; by: string; action: string; detail: string | null; at: string }[];
};

export async function getTicket(id: string): Promise<TicketDetail | null> {
  assertId(id, "ticket");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await from(supabase, "tickets")
    .select("*, ticket_categories(name, sensitive)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, "Couldn't open the ticket. Please try again.");
  if (!data) return null;
  const t = data as unknown as DbTicket & { description: string; project: string | null; work_log_id: string | null; resolution_notes: string | null; resolved_at: string | null; closed_at: string | null; ticket_categories: { name: string; sensitive: boolean } | { name: string; sensitive: boolean }[] | null };

  const [followers, comments, files, subtasks, history, activity, staff, log] = await Promise.all([
    from(supabase, "ticket_followers").select("user_id").eq("ticket_id", id),
    from(supabase, "ticket_comments").select("id, author_id, body, internal, created_at").eq("ticket_id", id).order("created_at", { ascending: true }).limit(500),
    from(supabase, "ticket_attachments").select("id, original_filename, mime_type, size_bytes, is_screenshot, uploader_id, created_at").eq("ticket_id", id).order("created_at", { ascending: true }),
    from(supabase, "ticket_subtasks").select("id, title, done").eq("ticket_id", id).order("created_at", { ascending: true }),
    from(supabase, "ticket_status_history").select("id, from_status, to_status, actor_id, note, created_at").eq("ticket_id", id).order("created_at", { ascending: true }).limit(200),
    from(supabase, "ticket_activity_logs").select("id, actor_id, action, detail, created_at").eq("ticket_id", id).order("created_at", { ascending: true }).limit(300),
    supabase.rpc("ticket_is_staff" as never, { p_id: id } as never),
    t.work_log_id ? supabase.from("work_logs").select("log_date, start_time, end_time, project, hours").eq("id", t.work_log_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const fl = (followers.data ?? []) as unknown as { user_id: string }[];
  const cm = (comments.data ?? []) as unknown as { id: string; author_id: string; body: string; internal: boolean; created_at: string }[];
  const fi = (files.data ?? []) as unknown as { id: string; original_filename: string; mime_type: string; size_bytes: number; is_screenshot: boolean; uploader_id: string; created_at: string }[];
  const st = (subtasks.data ?? []) as unknown as { id: string; title: string; done: boolean }[];
  const hi = (history.data ?? []) as unknown as { id: string; from_status: string | null; to_status: string; actor_id: string | null; note: string | null; created_at: string }[];
  const ac = (activity.data ?? []) as unknown as { id: string; actor_id: string | null; action: string; detail: string | null; created_at: string }[];

  const names = await peopleMap(supabase, [t.raised_by, t.assignee_id, ...fl.map((f) => f.user_id), ...cm.map((c) => c.author_id), ...fi.map((f) => f.uploader_id), ...hi.map((h) => h.actor_id), ...ac.map((a) => a.actor_id)]);
  const person = (pid: string): Person => ({ id: pid, name: names.get(pid) ?? "Unknown" });
  const wl = log.data as { log_date: string; start_time: string | null; end_time: string | null; project: string | null; hours: number } | null;
  const cat = one(t.ticket_categories) as { name: string; sensitive: boolean } | null;
  const isStaff = staff.data === true;

  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    description: t.description,
    status: isStatus(t.status) ? t.status : "open",
    priority: isPriority(t.priority) ? t.priority : "medium",
    department: t.department,
    category: cat?.name ?? "",
    sensitive: !!cat?.sensitive,
    project: t.project,
    workLogId: t.work_log_id,
    workLog: wl ? { date: wl.log_date, start: wl.start_time?.slice(0, 5) ?? null, end: wl.end_time?.slice(0, 5) ?? null, project: wl.project, hours: Number(wl.hours) } : null,
    dueOn: t.due_on,
    resolutionNotes: t.resolution_notes,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    resolvedAt: t.resolved_at,
    closedAt: t.closed_at,
    raisedBy: person(t.raised_by),
    assignee: t.assignee_id ? person(t.assignee_id) : null,
    followers: fl.map((f) => person(f.user_id)),
    me: { id: me.id, raiser: t.raised_by === me.id, staff: isStaff, admin: me.role === "admin", following: fl.some((f) => f.user_id === me.id) },
    comments: cm.map((c) => ({ id: c.id, author: person(c.author_id), body: c.body, internal: c.internal, createdAt: c.created_at })),
    attachments: fi.map((f) => ({ id: f.id, name: f.original_filename, mime: f.mime_type, size: f.size_bytes, screenshot: f.is_screenshot, by: names.get(f.uploader_id) ?? "Unknown", createdAt: f.created_at })),
    subtasks: st,
    history: hi.map((h) => ({ id: h.id, from: h.from_status, to: h.to_status, by: h.actor_id ? (names.get(h.actor_id) ?? "Unknown") : "System", note: h.note, at: h.created_at })),
    activity: ac.map((a) => ({ id: a.id, by: a.actor_id ? (names.get(a.actor_id) ?? "Unknown") : "System", action: a.action, detail: a.detail, at: a.created_at })),
  };
}

/** People who can be assigned, followed or tagged on this ticket. */
export async function ticketPeople(id: string): Promise<{ id: string; name: string; canHandle: boolean }[]> {
  assertId(id, "ticket");
  await requireUser();
  const supabase = await db();
  const rows = await rpc<{ id: string; name: string; can_handle: boolean }[]>(supabase, "ticket_people_for", { p_id: id }, "Couldn't load the people.");
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, canHandle: r.can_handle }));
}

// ---------- Changes ----------
export async function setStatus(id: string, to: string, note?: string): Promise<void> {
  assertId(id, "ticket");
  if (!isStatus(to)) throw new TimesheetError("Choose a status.");
  await requireUser();
  await rpc(await db(), "ticket_set_status", { p_id: id, p_to: to, p_note: note ?? null }, "Couldn't change the status. Please try again.");
}

export async function assignTicket(id: string, assignee: string | null): Promise<void> {
  assertId(id, "ticket");
  if (assignee !== null) assertId(assignee, "person");
  await requireUser();
  await rpc(await db(), "ticket_assign", { p_id: id, p_assignee: assignee }, "Couldn't assign the ticket. Please try again.");
}

export type Changes = { subject?: string; description?: string; priority?: string; dueOn?: string | null };

export async function updateTicket(id: string, changes: Changes): Promise<void> {
  assertId(id, "ticket");
  await requireUser();
  const payload: Record<string, string> = {};
  if (changes.subject !== undefined) payload.subject = changes.subject;
  if (changes.description !== undefined) payload.description = changes.description;
  if (changes.priority !== undefined) payload.priority = changes.priority;
  if (changes.dueOn !== undefined) {
    if (changes.dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(changes.dueOn)) throw new TimesheetError("Choose a valid deadline.");
    payload.due_on = changes.dueOn ?? "";
  }
  await rpc(await db(), "ticket_update", { p_id: id, p_changes: payload }, "Couldn't save the change. Please try again.");
}

export async function addComment(id: string, body: string, internal: boolean): Promise<void> {
  assertId(id, "ticket");
  await requireUser();
  const mentions = mentionIds(body).filter(isUuid);
  await rpc(await db(), "ticket_comment_add", { p_id: id, p_body: body, p_internal: internal, p_mentions: mentions }, "Couldn't add the comment. Please try again.");
}

export async function setFollowing(id: string, userId: string, on: boolean): Promise<void> {
  assertId(id, "ticket");
  assertId(userId, "person");
  await requireUser();
  await rpc(await db(), "ticket_follow", { p_id: id, p_user: userId, p_on: on }, "Couldn't change the followers. Please try again.");
}

export async function addSubtask(id: string, title: string): Promise<void> {
  assertId(id, "ticket");
  await requireUser();
  await rpc(await db(), "ticket_subtask_add", { p_id: id, p_title: title }, "Couldn't add the subtask. Please try again.");
}
export async function setSubtask(subId: string, done: boolean): Promise<void> {
  assertId(subId, "subtask");
  await requireUser();
  await rpc(await db(), "ticket_subtask_set", { p_sub: subId, p_done: done }, "Couldn't change the subtask. Please try again.");
}
export async function deleteSubtask(subId: string): Promise<void> {
  assertId(subId, "subtask");
  await requireUser();
  await rpc(await db(), "ticket_subtask_delete", { p_sub: subId }, "Couldn't remove the subtask. Please try again.");
}

// ---------- Raise ----------
export type NewTicket = { categoryId: string; subject: string; description: string; priority: string; project?: string; workLogId?: string };

export async function createTicket(input: NewTicket): Promise<{ id: string; number: number }> {
  await requireUser();
  if (!isUuid(input.categoryId)) throw new TimesheetError("Choose a category.");
  if (input.workLogId && !isUuid(input.workLogId)) throw new TimesheetError("Choose one of your own time logs.");
  const supabase = await db();
  const id = await rpc<string>(supabase, "ticket_create", {
    p_category: input.categoryId,
    p_subject: input.subject,
    p_description: input.description,
    p_priority: input.priority,
    p_project: input.project ?? null,
    p_work_log: input.workLogId ?? null,
  }, "Couldn't raise the ticket. Please try again.");
  const { data } = await from(supabase, "tickets").select("number").eq("id", id).maybeSingle();
  return { id, number: (data as unknown as { number: number } | null)?.number ?? 0 };
}

// ---------- Files ----------
export async function addAttachment(ticketId: string, file: File, screenshot = false): Promise<void> {
  assertId(ticketId, "ticket");
  const me = await requireUser();
  if (file.size === 0) throw new TimesheetError("Choose a file first.");
  if (file.size > FILE_MAX_BYTES) throw new TimesheetError(`${safeFileName(file.name)} is too large. Use files up to 10 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFile(bytes, file.name);
  if (!kind) throw new TimesheetError(`${safeFileName(file.name)}: that file type isn't allowed. Use ${FILE_TYPES_TEXT}.`);

  const supabase = await db();
  const existing = await from(supabase, "ticket_attachments").select("id", { count: "exact", head: true }).eq("ticket_id", ticketId);
  if ((existing.count ?? 0) >= FILES_PER_TICKET) throw new TimesheetError(`A ticket can have up to ${FILES_PER_TICKET} attachments.`);

  const key = `${me.id}/${randomUUID()}.${kind.ext}`;
  const up = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    logError("ticket file upload", up.error);
    throw new TimesheetError(/not found|bucket/i.test(up.error.message) ? NOT_SET_UP : "Couldn't upload the file. Please try again.");
  }
  try {
    await rpc(supabase, "ticket_attach", { p_id: ticketId, p_key: key, p_filename: safeFileName(file.name), p_mime: kind.mime, p_size: file.size, p_screenshot: screenshot }, "Couldn't attach the file. Please try again.");
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([key]); // don't leave a file nobody can see
    throw e;
  }
}

/** A one-minute link to a file, made only after the database says this person may read it. */
export async function attachmentUrl(id: string): Promise<{ url: string; name: string } | null> {
  assertId(id, "file");
  await requireUser();
  const supabase = await db();
  const { data } = await from(supabase, "ticket_attachments").select("storage_key, original_filename").eq("id", id).maybeSingle();
  const row = data as unknown as { storage_key: string; original_filename: string } | null;
  if (!row) return null;
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_key, 60, { download: row.original_filename });
  return signed.error || !signed.data ? null : { url: signed.data.signedUrl, name: row.original_filename };
}

// ---------- For the form ----------
export type MyLog = { id: string; date: string; start: string | null; end: string | null; project: string | null; hours: number };

/** Your recent time logs, to pick one when the ticket is about a timesheet entry. */
export async function myRecentLogs(): Promise<MyLog[]> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("work_logs").select("id, log_date, start_time, end_time, project, hours").eq("user_id", me.id).order("log_date", { ascending: false }).order("start_time", { ascending: false }).limit(40);
  if (error) throw toError(error, "Couldn't load your time logs.");
  return data.map((r) => ({ id: r.id, date: r.log_date, start: r.start_time?.slice(0, 5) ?? null, end: r.end_time?.slice(0, 5) ?? null, project: r.project, hours: Number(r.hours) }));
}

/** Tickets raised against these time logs, for the link on the work log page. Empty before step 45 has been run. */
export async function ticketsForLogs(logIds: string[]): Promise<Map<string, { id: string; number: number; status: Status }>> {
  const out = new Map<string, { id: string; number: number; status: Status }>();
  const ids = logIds.filter(isUuid).slice(0, 200);
  if (ids.length === 0) return out;
  try {
    const supabase = await db();
    const { data } = await supabase.rpc("ticket_for_logs" as never, { p_logs: ids } as never);
    for (const r of (data ?? []) as unknown as { work_log_id: string; ticket_id: string; number: number; status: string }[]) {
      if (!out.has(r.work_log_id)) out.set(r.work_log_id, { id: r.ticket_id, number: r.number, status: isStatus(r.status) ? r.status : "open" });
    }
  } catch {
    // before step 45 there are simply none
  }
  return out;
}

// ---------- The project board ----------
/** The tickets about one project as board cards (most recent 500), in the order they were placed. Which ones come back is decided by the database. */
export async function listBoard(project: string): Promise<BoardCard[]> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await from(supabase, "tickets").select(`${SELECT}, position`).eq("project", project).order("position", { ascending: true }).limit(500);
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, "Couldn't load the tickets. Please try again.");
  const rows = data as unknown as (DbTicket & { position: number })[];
  const names = await peopleMap(supabase, rows.flatMap((r) => [r.raised_by, r.assignee_id]));
  return rows.map((r) => ({ ...toRow(r), position: Number(r.position), raisedByName: names.get(r.raised_by) ?? "Unknown", assigneeName: r.assignee_id ? (names.get(r.assignee_id) ?? "Unknown") : null }));
}

/** Drag a card: a new status (null = same column), a note when the move needs one, and its new place in the column. */
export async function moveTicket(id: string, to: string | null, note: string | null, position: number): Promise<void> {
  assertId(id, "ticket");
  if (to !== null && !isStatus(to)) throw new TimesheetError("Choose a status.");
  if (!Number.isFinite(position)) throw new TimesheetError("That position isn't valid.");
  await requireUser();
  await rpc(await db(), "ticket_move", { p_id: id, p_to: to, p_note: note, p_position: position }, "Couldn't move the ticket. Please try again.");
}

/** The people a ticket can be assigned to when it is created (admins only; everyone else gets none). */
export async function assignablePeople(): Promise<{ id: string; name: string }[]> {
  const me = await requireUser();
  if (me.role !== "admin") return [];
  const supabase = await db();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email").eq("status", "active").neq("role", "viewer").order("full_name").limit(500);
  if (error) throw toError(error, "Couldn't load the people. Please try again.");
  return data.map((p) => ({ id: p.id, name: p.full_name?.trim() || p.email }));
}
