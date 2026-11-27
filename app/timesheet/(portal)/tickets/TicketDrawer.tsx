"use client";

import { Check, Download, FileText, Loader2, Lock, Paperclip, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fmtSize } from "@/lib/expenses/billFile";
import { FILE_ACCEPT, FILE_TYPES_TEXT, isImage, isOverdue, nextStatuses, noteNeeded, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, ticketCode, type Person, type Priority, type Status } from "@/lib/tickets/model";
import type { TicketDetail } from "@/lib/tickets/server";
import { UserAvatar } from "../../_components/UserAvatar";
import {
  addCommentAction,
  addSubtaskAction,
  assignAction,
  deleteSubtaskAction,
  followAction,
  setStatusAction,
  setSubtaskAction,
  ticketDetailAction,
  ticketPeopleAction,
  updateTicketAction,
} from "./actions";
import { fmtDate, fmtDateTime, Markup, PriorityTag, RichText, selectClass, StatusPill } from "./parts";

type People = { id: string; name: string; canHandle: boolean }[];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function PersonChip({ person, sub }: { person: Person; sub?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <UserAvatar userId={person.id} name={person.name} className="size-6 text-[10px]" />
      <span className="truncate">{person.name}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </span>
  );
}

// An Asana-style right-hand drawer for one ticket. Everything is edited in place; each change goes to the server, which checks
// that this person is allowed (and that the workflow allows it), and the drawer then shows what the server saved.
export default function TicketDrawer({ id, today, onClose, onChanged }: { id: string | null; today: string; onClose: () => void; onChanged: () => void }) {
  // The last ticket opened stays in the panel while it slides out, so it doesn't go blank. Each ticket gets a fresh body (its key).
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">{shown && <DrawerBody key={shown} id={shown} today={today} onChanged={onChanged} />}</SheetContent>
    </Sheet>
  );
}

function DrawerBody({ id, today, onChanged }: { id: string; today: string; onChanged: () => void }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<People>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const show = useCallback((res: Awaited<ReturnType<typeof ticketDetailAction>>) => {
    if (!res.ok) setError(res.error);
    else if (!res.ticket) setError("That ticket could not be found, or you can't see it.");
    else {
      setError(null);
      setTicket(res.ticket);
    }
    setLoading(false);
  }, [setError, setTicket]);

  /** Fetch the ticket again after a change, so the drawer shows exactly what the server saved. */
  const load = useCallback(async () => show(await ticketDetailAction(id)), [id, show]);

  useEffect(() => {
    let live = true;
    ticketDetailAction(id).then((res) => live && show(res));
    return () => {
      live = false;
    };
  }, [id, show]);

  // The people who can be assigned or tagged.
  useEffect(() => {
    if (!ticket) return;
    let live = true;
    ticketPeopleAction(id).then((r) => live && r.ok && setPeople(r.people));
    return () => {
      live = false;
    };
    // only when the ticket opens, and again if the people involved change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ticket?.assignee?.id, ticket?.followers.length]);

  /** Run a change on the server, then show the saved ticket. */
  async function change(key: string, work: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string): Promise<boolean> {
    setBusy(key);
    const res = await work();
    if (!res.ok) {
      toast.error(res.error);
      setBusy(null);
      return false;
    }
    await load();
    onChanged();
    setBusy(null);
    if (done) toast.success(done);
    return true;
  }

  const t = ticket;
  const closed = t?.status === "closed";
  const canEditText = !!t && !closed && (t.me.staff || (t.me.raiser && (t.status === "open" || t.status === "reopened")));
  const canHandle = !!t && !closed && t.me.staff;

  return (
    <>
        <SheetHeader className="border-b">
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-8">
            {t ? ticketCode(t.number) : "Ticket"}
            {t && <StatusPill status={t.status} />}
            {t && isOverdue(t.dueOn, t.status, today) && <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">Overdue</span>}
            {t?.sensitive && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Lock className="size-3" aria-hidden="true" /> Restricted
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">Details, comments and history of this ticket.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && !t ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Loading the ticket">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : error && !t ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : t ? (
            <div className="grid gap-5">
              <Title key={t.subject} ticket={t} editable={canEditText} busy={busy === "title"} onSave={(subject) => change("title", () => updateTicketAction(t.id, { subject }))} />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 max-sm:grid-cols-1">
                <Field label="Status">
                  <StatusControl ticket={t} busy={busy === "status"} onMove={(to, note) => change("status", () => setStatusAction(t.id, to, note), `Moved to ${STATUS_LABEL[to]}.`)} />
                </Field>
                <Field label="Priority">
                  {canHandle ? (
                    <select className={selectClass} value={t.priority} disabled={busy === "priority"} aria-label="Priority" onChange={(e) => change("priority", () => updateTicketAction(t.id, { priority: e.target.value }))}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <PriorityTag priority={t.priority as Priority} />
                  )}
                </Field>
                <Field label="Assigned to">
                  {canHandle ? (
                    <select className={selectClass} value={t.assignee?.id ?? ""} disabled={busy === "assign"} aria-label="Assigned to" onChange={(e) => change("assign", () => assignAction(t.id, e.target.value || null), e.target.value ? "Ticket assigned." : "Ticket unassigned.")}>
                      <option value="">Unassigned</option>
                      {t.assignee && !people.some((p) => p.id === t.assignee!.id) && <option value={t.assignee.id}>{t.assignee.name}</option>}
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : t.assignee ? (
                    <PersonChip person={t.assignee} />
                  ) : (
                    <span className="text-muted-foreground">Not assigned yet</span>
                  )}
                </Field>
                <Field label="Due date">
                  {canHandle ? (
                    <input type="date" className={selectClass} value={t.dueOn ?? ""} disabled={busy === "due"} aria-label="Due date" onChange={(e) => change("due", () => updateTicketAction(t.id, { dueOn: e.target.value || null }))} />
                  ) : (
                    <span className={isOverdue(t.dueOn, t.status, today) ? "font-medium text-red-600" : undefined}>{fmtDate(t.dueOn)}</span>
                  )}
                </Field>
                <Field label="Raised by">
                  <PersonChip person={t.raisedBy} />
                </Field>
                <Field label="Department">{t.department}</Field>
                <Field label="Category">{t.category}</Field>
                <Field label="Created">{fmtDateTime(t.createdAt)}</Field>
                {t.project && <Field label="Project">{t.project}</Field>}
                {t.workLog && (
                  <Field label="Timesheet entry">
                    {fmtDate(t.workLog.date)}
                    {t.workLog.start && t.workLog.end ? ` · ${t.workLog.start}–${t.workLog.end}` : ""} · {t.workLog.hours} h{t.workLog.project ? ` · ${t.workLog.project}` : ""}
                  </Field>
                )}
              </dl>

              {t.status === "resolved" && t.me.raiser && (
                <div className="grid gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
                  <p className="font-medium">This ticket was marked resolved. Did it fix your problem?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={!!busy} onClick={() => change("status", () => setStatusAction(t.id, "closed"), "Thanks! The ticket is closed.")}>
                      <Check aria-hidden="true" /> Yes, close it
                    </Button>
                    <ReopenButton disabled={!!busy} onReopen={(note) => change("status", () => setStatusAction(t.id, "reopened", note), "Ticket reopened.")} />
                  </div>
                </div>
              )}

              <DescriptionSection value={t.description} editable={canEditText} busy={busy === "description"} onSave={(description) => change("description", () => updateTicketAction(t.id, { description }))} />

              {t.resolutionNotes && (
                <Section title="Resolution notes">
                  <Markup text={t.resolutionNotes} />
                </Section>
              )}

              <Attachments ticket={t} canAdd={!closed && (t.me.raiser || t.me.staff)} onAdded={async () => { await load(); onChanged(); }} />

              <Subtasks ticket={t} canEdit={canHandle} busy={busy} change={change} />

              <Followers ticket={t} people={people} busy={busy === "follow"} change={change} />

              <Comments ticket={t} people={people} closed={!!closed} busy={busy === "comment"} onPost={(body, internal) => change("comment", () => addCommentAction(t.id, body, internal))} />

              <Timeline ticket={t} />
            </div>
          ) : null}
        </div>
    </>
  );
}

// ---------- Title ----------
function Title({ ticket, editable, busy, onSave }: { ticket: TicketDetail; editable: boolean; busy: boolean; onSave: (s: string) => Promise<boolean> }) {
  const [value, setValue] = useState(ticket.subject);
  if (!editable) return <h2 className="text-xl font-semibold leading-snug break-words">{ticket.subject}</h2>;
  async function commit() {
    const next = value.trim();
    if (next === ticket.subject) return;
    if (next.length < 3) return setValue(ticket.subject);
    if (!(await onSave(next))) setValue(ticket.subject);
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor="tk-title" className="sr-only">
        Title
      </Label>
      <Input id="tk-title" value={value} maxLength={150} disabled={busy} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="h-auto border-transparent px-1 py-1 text-xl font-semibold shadow-none hover:border-input focus-visible:border-ring" />
    </div>
  );
}

// ---------- Status ----------
function StatusControl({ ticket, busy, onMove }: { ticket: TicketDetail; busy: boolean; onMove: (to: Status, note?: string) => Promise<boolean> }) {
  const options = useMemo(() => nextStatuses(ticket.status, { raiser: ticket.me.raiser, staff: ticket.me.staff, admin: ticket.me.admin }), [ticket]);
  const [to, setTo] = useState<Status | "">("");
  const [note, setNote] = useState("");
  const needs = to ? noteNeeded(to) : null;

  if (options.length === 0) return <StatusPill status={ticket.status} />;

  async function go() {
    if (!to) return;
    if (needs && note.trim().length < 3) return toast.error(needs === "resolution" ? "Write the resolution notes first." : "Say why you are reopening it.");
    if (await onMove(to, note.trim() || undefined)) {
      setTo("");
      setNote("");
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <StatusPill status={ticket.status} />
        <select className={selectClass} value={to} disabled={busy} aria-label="Move to" onChange={(e) => setTo(e.target.value as Status | "")}>
          <option value="">Move to…</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {to && (
        <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5">
          {needs && (
            <>
              <Label htmlFor="tk-note" className="text-xs">
                {needs === "resolution" ? "Resolution notes (required)" : "Why is it being reopened? (required)"}
              </Label>
              <Textarea id="tk-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={needs === "resolution" ? "What was done to fix it?" : "What is still wrong?"} />
            </>
          )}
          {!needs && <Textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" />}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={go} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Move to {STATUS_LABEL[to]}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setTo(""); setNote(""); }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReopenButton({ disabled, onReopen }: { disabled: boolean; onReopen: (note: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open)
    return (
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        No, reopen it
      </Button>
    );
  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="tk-reopen" className="text-xs">
        What is still wrong? (required)
      </Label>
      <Textarea id="tk-reopen" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={async () => {
            if (note.trim().length < 3) return toast.error("Say why you are reopening it.");
            if (await onReopen(note.trim())) setOpen(false);
          }}
        >
          Reopen ticket
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------- Description ----------
function DescriptionSection({ value, editable, busy, onSave }: { value: string; editable: boolean; busy: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  return (
    <Section
      title="Description"
      aside={
        editable ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => { setText(value); setOpen((o) => !o); }}>
            {open ? "Cancel" : "Edit"}
          </Button>
        ) : null
      }
    >
      {open ? (
        <div className="grid gap-2">
          <RichText value={text} onChange={setText} maxLength={5000} rows={6} />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (await onSave(text)) setOpen(false);
              }}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save description
            </Button>
          </div>
        </div>
      ) : value.trim() ? (
        <Markup text={value} />
      ) : (
        <p className="text-sm text-muted-foreground">No description.</p>
      )}
    </Section>
  );
}

// ---------- Attachments ----------
function Attachments({ ticket, canAdd, onAdded }: { ticket: TicketDetail; canAdd: boolean; onAdded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("ticketId", ticket.id);
      form.set("file", file);
      try {
        const r = await fetch("/api/tickets/files", { method: "POST", body: form });
        const body = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!r.ok || !body?.ok) toast.error(body?.error ?? `${file.name} couldn't be attached.`);
        else added++;
      } catch {
        toast.error(`${file.name} couldn't be attached.`);
      }
    }
    setUploading(false);
    if (added) {
      toast.success(added === 1 ? "File attached." : `${added} files attached.`);
      await onAdded();
    }
  }

  return (
    <Section
      title={`Attachments${ticket.attachments.length ? ` (${ticket.attachments.length})` : ""}`}
      aside={
        canAdd ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Paperclip aria-hidden="true" />} Add file
            </Button>
            <input ref={input} type="file" multiple accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose files to attach" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </>
        ) : null
      }
    >
      {ticket.attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached. {canAdd && `${FILE_TYPES_TEXT}.`}</p>
      ) : (
        <ul className="grid gap-1.5">
          {ticket.attachments.map((a) => (
            <li key={a.id}>
              <a href={`/api/tickets/files?id=${a.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent">
                {isImage(a.mime) ? <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.screenshot && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Screenshot</span>}
                <span className="text-xs text-muted-foreground">
                  {a.by} · {fmtSize(a.size)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- Subtasks ----------
function Subtasks({ ticket, canEdit, busy, change }: { ticket: TicketDetail; canEdit: boolean; busy: string | null; change: (k: string, w: () => Promise<{ ok: true } | { ok: false; error: string }>, d?: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const done = ticket.subtasks.filter((s) => s.done).length;
  if (ticket.subtasks.length === 0 && !canEdit) return null;
  return (
    <Section title={`Subtasks${ticket.subtasks.length ? ` (${done}/${ticket.subtasks.length})` : ""}`}>
      {ticket.subtasks.length > 0 && (
        <ul className="grid gap-1">
          {ticket.subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={s.done} disabled={!canEdit || !!busy} aria-label={`${s.title}: ${s.done ? "done" : "not done"}`} onChange={(e) => change(`sub-${s.id}`, () => setSubtaskAction(s.id, e.target.checked))} />
              <span className={s.done ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>{s.title}</span>
              {canEdit && (
                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove subtask ${s.title}`} disabled={!!busy} onClick={() => change(`sub-${s.id}`, () => deleteSubtaskAction(s.id))}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            if (await change("sub-add", () => addSubtaskAction(ticket.id, title.trim()))) setTitle("");
          }}
        >
          <Input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask" aria-label="New subtask" />
          <Button type="submit" size="sm" variant="outline" disabled={!!busy || !title.trim()}>
            <Plus aria-hidden="true" /> Add
          </Button>
        </form>
      )}
    </Section>
  );
}

// ---------- Followers ----------
function Followers({ ticket, people, busy, change }: { ticket: TicketDetail; people: People; busy: boolean; change: (k: string, w: () => Promise<{ ok: true } | { ok: false; error: string }>, d?: string) => Promise<boolean> }) {
  const addable = people.filter((p) => !ticket.followers.some((f) => f.id === p.id));
  return (
    <Section
      title={`Followers (${ticket.followers.length})`}
      aside={
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => change("follow", () => followAction(ticket.id, ticket.me.id, !ticket.me.following), ticket.me.following ? "You stopped following this ticket." : "You are following this ticket.")}>
          {ticket.me.following ? <UserMinus aria-hidden="true" /> : <UserPlus aria-hidden="true" />} {ticket.me.following ? "Unfollow" : "Follow"}
        </Button>
      }
    >
      <ul className="flex flex-wrap gap-2">
        {ticket.followers.map((f) => (
          <li key={f.id} className="rounded-full border px-2 py-1 text-sm">
            <PersonChip person={f} />
          </li>
        ))}
      </ul>
      {ticket.me.staff && ticket.status !== "closed" && addable.length > 0 && (
        <select className={selectClass} value="" aria-label="Add a follower" disabled={busy} onChange={(e) => e.target.value && change("follow", () => followAction(ticket.id, e.target.value, true), "Follower added.")}>
          <option value="">Add a follower…</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </Section>
  );
}

// ---------- Comments ----------
function Comments({ ticket, people, closed, busy, onPost }: { ticket: TicketDetail; people: People; closed: boolean; busy: boolean; onPost: (body: string, internal: boolean) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [tagged, setTagged] = useState<Person[]>([]);
  const query = /(?:^|\s)@([\p{L}\p{N} ]{0,24})$/u.exec(text);
  const suggestions = query ? people.filter((p) => p.id !== ticket.me.id && p.name.toLowerCase().includes(query[1].trim().toLowerCase())).slice(0, 6) : [];

  function tag(p: { id: string; name: string }) {
    setText((v) => v.replace(/@([\p{L}\p{N} ]{0,24})$/u, `@${p.name} `));
    setTagged((l) => (l.some((x) => x.id === p.id) ? l : [...l, { id: p.id, name: p.name }]));
  }

  async function post() {
    let body = text.trim();
    if (!body) return;
    // Names the person chose from the list become tags the server understands: @[Name](id).
    for (const p of tagged) body = body.split(`@${p.name}`).join(`@[${p.name}](${p.id})`);
    if (await onPost(body, internal)) {
      setText("");
      setTagged([]);
      setInternal(false);
    }
  }

  return (
    <Section title={`Comments${ticket.comments.length ? ` (${ticket.comments.length})` : ""}`}>
      {ticket.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="grid gap-3">
          {ticket.comments.map((c) => (
            <li key={c.id} className={`flex gap-2.5 ${c.internal ? "rounded-lg border border-dashed bg-amber-50/60 p-2.5 dark:bg-amber-950/20" : ""}`}>
              <UserAvatar userId={c.author.id} name={c.author.name} className="mt-0.5 size-7 shrink-0 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{c.author.name}</span> <span className="text-xs text-muted-foreground">{fmtDateTime(c.createdAt)}</span>
                  {c.internal && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <Lock className="size-3" aria-hidden="true" /> Internal note
                    </span>
                  )}
                </p>
                <Markup text={c.body} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed ? (
        <p className="text-sm text-muted-foreground">This ticket is closed.{ticket.me.raiser ? " Reopen it to add more." : ""}</p>
      ) : (
        <div className="grid gap-2">
          <div className="relative">
            <RichText value={text} onChange={setText} maxLength={3000} rows={3} placeholder="Write a comment. Type @ to tag someone." disabled={busy} />
            {suggestions.length > 0 && (
              <ul role="listbox" aria-label="People to tag" className="absolute right-0 left-0 z-10 mt-1 grid overflow-hidden rounded-md border bg-popover shadow-md">
                {suggestions.map((p) => (
                  <li key={p.id} role="option" aria-selected={false}>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => tag(p)}>
                      <UserAvatar userId={p.id} name={p.name} className="size-5 text-[9px]" /> {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {ticket.me.staff ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (only the team handling this ticket sees it)
              </label>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={post} disabled={busy || !text.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Comment
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------- History ----------
function Timeline({ ticket }: { ticket: TicketDetail }) {
  const items = useMemo(() => {
    const list: { id: string; at: string; text: string; note?: string | null }[] = [];
    for (const h of ticket.history) {
      const from = h.from ? STATUS_LABEL[h.from as Status] ?? h.from : null;
      list.push({ id: `h-${h.id}`, at: h.at, text: from ? `${h.by} moved it from ${from} to ${STATUS_LABEL[h.to as Status] ?? h.to}` : `${h.by} raised the ticket`, note: h.note });
    }
    for (const a of ticket.activity) {
      if (a.action === "status" || a.action === "created") continue;
      list.push({ id: `a-${a.id}`, at: a.at, text: `${a.by}: ${a.action}${a.detail ? ` (${a.detail})` : ""}` });
    }
    return list.sort((x, y) => x.at.localeCompare(y.at));
  }, [ticket]);
  return (
    <Section title="Activity">
      <ol className="grid gap-2.5 border-l pl-4">
        {items.map((i) => (
          <li key={i.id} className="relative text-sm">
            <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border" />
            <p>{i.text}</p>
            {i.note && <p className="mt-0.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{i.note}</p>}
            <p className="text-xs text-muted-foreground">{fmtDateTime(i.at)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
