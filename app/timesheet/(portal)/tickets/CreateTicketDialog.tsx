"use client";

import { CalendarDays, CircleDot, Loader2, Tag, Users, X, Flag, FolderKanban, FileText } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtSize } from "@/lib/expenses/billFile";
import { FILE_ACCEPT, FILE_MAX_BYTES, FILE_TYPES_TEXT, FILES_PER_TICKET, PRIORITIES, PRIORITY_LABEL, ticketCode, type Priority } from "@/lib/tickets/model";
import type { Category } from "@/lib/tickets/server";
import { assignAction, createTicketAction, updateTicketAction } from "./actions";
import { RichText } from "./parts";

type Picked = { file: File; screenshot: boolean };

const chip = "inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-within:ring-[3px] focus-within:ring-ring/40";
const chipSelect = "max-w-40 cursor-pointer bg-transparent text-xs text-foreground outline-none";

// "Create new ticket", laid out like GitHub's "Create new issue": a title, a description with Write and Preview tabs, a strip to add
// files, and a row of fields underneath (status, assignee, category, priority, project, due date). "Create more" keeps the dialog
// open for the next one. Ctrl or Cmd + Enter creates. Assigning and the due date are for the people who handle tickets.
export default function CreateTicketDialog({
  open,
  onOpenChange,
  project,
  categories,
  people,
  canTriage,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: string;
  categories: Category[];
  people: { id: string; name: string }[];
  canTriage: boolean;
  onCreated: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl" aria-describedby={undefined}>
        {open && <CreateForm project={project} categories={categories} people={people} canTriage={canTriage} onClose={() => onOpenChange(false)} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ project, categories, people, canTriage, onClose, onCreated }: { project: string; categories: Category[]; people: { id: string; name: string }[]; canTriage: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((c) => c.name === "General Requests")?.id ?? categories[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const category = categories.find((c) => c.id === categoryId);

  function addFiles(list: File[]) {
    const next = [...picked];
    for (const file of list) {
      if (file.size > FILE_MAX_BYTES) toast.error(`${file.name} is too large. Use files up to 10 MB.`);
      else if (next.length >= FILES_PER_TICKET) toast.error(`You can attach up to ${FILES_PER_TICKET} files.`);
      else next.push({ file, screenshot: file.type.startsWith("image/") && /^screenshot-/.test(file.name) });
    }
    setPicked(next);
  }

  async function submit() {
    if (saving) return;
    if (title.trim().length < 3) {
      setTitleError("Give the ticket a title of at least 3 characters.");
      titleRef.current?.focus();
      return;
    }
    if (!categoryId) return toast.error("Choose a category.");
    setSaving(true);
    const res = await createTicketAction({ categoryId, subject: title.trim(), description, priority, project });
    if (!res.ok) {
      setSaving(false);
      return toast.error(res.error);
    }
    // Everything after the ticket exists: files, who will handle it, and the deadline. A failure here doesn't lose the ticket.
    const problems: string[] = [];
    for (const { file, screenshot } of picked) {
      const form = new FormData();
      form.set("ticketId", res.id);
      form.set("file", file);
      if (screenshot) form.set("screenshot", "1");
      try {
        const r = await fetch("/api/tickets/files", { method: "POST", body: form });
        const body = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!r.ok || !body?.ok) problems.push(body?.error ?? `${file.name} couldn't be attached.`);
      } catch {
        problems.push(`${file.name} couldn't be attached.`);
      }
    }
    if (canTriage && assignee) {
      const a = await assignAction(res.id, assignee);
      if (!a.ok) problems.push(a.error);
    }
    if (canTriage && due) {
      const d = await updateTicketAction(res.id, { dueOn: due });
      if (!d.ok) problems.push(d.error);
    }
    setSaving(false);
    toast.success(`${ticketCode(res.number)} created.`);
    if (problems.length) toast.error(problems.join(" "), { duration: 8000 });
    onCreated(res.id);
    if (more) {
      setTitle("");
      setDescription("");
      setPicked([]);
      setTitleError(null);
      titleRef.current?.focus();
    } else onClose();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void submit();
        }
      }}
      className="flex max-h-[90vh] flex-col"
    >
      <div className="flex items-center gap-2 border-b px-5 py-3 pr-12">
        <DialogTitle className="truncate text-sm font-semibold">Create new ticket in {project}</DialogTitle>
        <DialogDescription className="sr-only">Title, description, files and the ticket&apos;s fields.</DialogDescription>
      </div>

      <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
        <div className="grid gap-1.5">
          <label htmlFor="tk-new-title" className="text-sm font-semibold">
            Add a title <span className="text-destructive">*</span>
          </label>
          <Input ref={titleRef} id="tk-new-title" autoFocus value={title} maxLength={150} placeholder="Title" aria-invalid={!!titleError} aria-describedby={titleError ? "tk-new-title-error" : undefined} onChange={(e) => { setTitle(e.target.value); setTitleError(null); }} />
          {titleError && (
            <p id="tk-new-title-error" role="alert" className="text-sm text-destructive">
              {titleError}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="tk-new-desc" className="text-sm font-semibold">
            Add a description
          </label>
          <RichText id="tk-new-desc" value={description} onChange={setDescription} maxLength={5000} rows={9} preview placeholder="Type your description here…" onFiles={addFiles} accept={FILE_ACCEPT} />
          <p className="text-xs text-muted-foreground">{FILE_TYPES_TEXT}.</p>
          {picked.length > 0 && (
            <ul className="grid gap-1.5">
              {picked.map((p, i) => (
                <li key={`${p.file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                  {p.screenshot && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Screenshot</span>}
                  <span className="text-xs text-muted-foreground">{fmtSize(p.file.size)}</span>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${p.file.name}`} onClick={() => setPicked((l) => l.filter((_, j) => j !== i))} disabled={saving}>
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ticket fields">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-xs" title="New tickets start in Open">
            Status
            <CircleDot className="size-3.5 text-emerald-500" aria-hidden="true" />
            <strong>Open</strong>
          </span>
          {canTriage && (
            <label className={chip}>
              <Users className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Assignee</span>
              <select className={chipSelect} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
                <option value="">Assignee</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={chip} title={category?.sensitive ? "Restricted: only the people handling it can see it" : undefined}>
            <Tag className="size-3.5" aria-hidden="true" />
            <select className={chipSelect} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={chip}>
            <Flag className="size-3.5" aria-hidden="true" />
            <select className={chipSelect} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priority">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-xs" title="The project this ticket belongs to">
            <FolderKanban className="size-3.5" aria-hidden="true" />
            <span className="max-w-40 truncate">{project}</span>
          </span>
          {canTriage && (
            <label className={chip}>
              <CalendarDays className="size-3.5" aria-hidden="true" />
              <input type="date" className={`${chipSelect} [color-scheme:inherit]`} value={due} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            </label>
          )}
        </div>
        {category?.sensitive && <p className="text-xs text-muted-foreground">This category is restricted. Only the person who raised it, the people handling it and admins can see this ticket.</p>}
      </div>

      <div className="flex items-center justify-end gap-3 border-t px-5 py-3">
        <label className="mr-auto inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={more} onChange={(e) => setMore(e.target.checked)} /> Create more
        </label>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />} Create
          <kbd className="ml-1 hidden rounded bg-white/20 px-1 text-[10px] font-normal sm:inline">Ctrl ↵</kbd>
        </Button>
      </div>
    </form>
  );
}
