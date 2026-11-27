"use client";

import { Camera, Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FILE_ACCEPT, FILE_MAX_BYTES, FILE_TYPES_TEXT, FILES_PER_TICKET, PRIORITIES, PRIORITY_LABEL, ticketCode, type Priority } from "@/lib/tickets/model";
import type { Category, MyLog } from "@/lib/tickets/server";
import { fmtSize } from "@/lib/expenses/billFile";
import { createTicketAction, raiseFormDataAction } from "./actions";
import { RichText, selectClass } from "./parts";

export type Prefill = { categoryName?: string; subject?: string; workLogId?: string; project?: string };

type Picked = { file: File; screenshot: boolean };
type Errors = Partial<Record<"category" | "subject" | "files", string>>;

const logLabel = (l: MyLog) => `${l.date}${l.start && l.end ? ` · ${l.start}–${l.end}` : ""}${l.project ? ` · ${l.project}` : ""} · ${l.hours} h`;

// "Raise a ticket": a right-hand drawer. The ticket number is made by the database when it is submitted; the employee's details
// come from the session. Files are sent one by one after the ticket exists (they are bigger than a form post may be).
type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  who: { name: string; email: string };
  prefill?: Prefill;
  onCreated?: (id: string) => void;
};

export default function RaiseTicketDrawer(props: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={props.open} onOpenChange={(o) => !busy && props.onOpenChange(o)}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">{props.open && <RaiseForm {...props} busy={busy} setBusy={setBusy} />}</SheetContent>
    </Sheet>
  );
}

// The form is only on the page while the drawer is open, so it starts clean every time.
function RaiseForm({ onOpenChange, who, prefill, onCreated, busy, setBusy }: Props & { busy: boolean; setBusy: (b: boolean) => void }) {
  const [data, setData] = useState<{ categories: Category[]; projects: string[]; logs: MyLog[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [project, setProject] = useState(prefill?.project ?? "");
  const [workLogId, setWorkLogId] = useState(prefill?.workLogId ?? "");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const wantedCategory = prefill?.categoryName;

  // The categories, projects and recent time logs.
  useEffect(() => {
    let live = true;
    raiseFormDataAction().then((res) => {
      if (!live) return;
      if (!res.ok) return setLoadError(res.error);
      setData(res);
      const wanted = wantedCategory ? res.categories.find((c) => c.name === wantedCategory) : undefined;
      if (wanted) setCategoryId(wanted.id);
    });
    return () => {
      live = false;
    };
  }, [wantedCategory]);

  const category = data?.categories.find((c) => c.id === categoryId);

  function addFiles(list: FileList | File[] | null, screenshot: boolean) {
    if (!list) return;
    const next = [...picked];
    let problem: string | null = null;
    for (const file of Array.from(list)) {
      if (file.size > FILE_MAX_BYTES) problem = `${file.name} is too large. Use files up to 10 MB.`;
      else if (next.length >= FILES_PER_TICKET) problem = `You can attach up to ${FILES_PER_TICKET} files.`;
      else if (screenshot && !file.type.startsWith("image/")) problem = "A screenshot must be an image.";
      else next.push({ file, screenshot });
    }
    setPicked(next);
    setErrors((e) => ({ ...e, files: problem ?? undefined }));
  }

  // A screenshot can simply be pasted (Ctrl+V) anywhere in the drawer.
  function onPaste(e: React.ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    addFiles(images.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `screenshot-${Date.now()}-${i + 1}.png`, { type: f.type })), true);
  }

  function pickLog(id: string) {
    setWorkLogId(id);
    const log = data?.logs.find((l) => l.id === id);
    if (log?.project && !project && data?.projects.includes(log.project)) setProject(log.project);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const found: Errors = {};
    if (!categoryId) found.category = "Choose a category.";
    if (subject.trim().length < 3) found.subject = "Give the ticket a subject of at least 3 characters.";
    setErrors(found);
    if (found.category || found.subject) {
      document.getElementById(found.category ? "tk-category" : "tk-subject")?.focus();
      return;
    }
    setBusy(true);
    const res = await createTicketAction({ categoryId, subject: subject.trim(), description, priority, project: project || undefined, workLogId: workLogId || undefined });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    const failed: string[] = [];
    for (const { file, screenshot } of picked) {
      const form = new FormData();
      form.set("ticketId", res.id);
      form.set("file", file);
      if (screenshot) form.set("screenshot", "1");
      try {
        const r = await fetch("/api/tickets/files", { method: "POST", body: form });
        const body = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!r.ok || !body?.ok) failed.push(body?.error ?? `${file.name} couldn't be attached.`);
      } catch {
        failed.push(`${file.name} couldn't be attached.`);
      }
    }
    setBusy(false);
    toast.success(`${ticketCode(res.number)} raised. It has been sent to ${category?.department ?? "the team"}.`);
    if (failed.length) toast.error(failed.join(" "), { duration: 8000 });
    onOpenChange(false);
    onCreated?.(res.id);
  }

  return (
        <form onSubmit={submit} onPaste={onPaste} noValidate className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b">
            <SheetTitle>Raise a ticket</SheetTitle>
            <SheetDescription>Tell us what is wrong or what you need. It goes to the right team automatically.</SheetDescription>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
            {loadError ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {loadError}
              </p>
            ) : !data ? (
              <div className="grid gap-3" aria-busy="true" aria-label="Loading the form">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Ticket ID</p>
                    <p className="font-medium">Made when you submit</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Employee</p>
                    <p className="truncate font-medium">{who.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Work email (your ID in the portal)</p>
                    <p className="truncate font-medium">{who.email}</p>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tk-category">Category *</Label>
                  <select id="tk-category" className={selectClass} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setErrors((x) => ({ ...x, category: undefined })); }} aria-invalid={!!errors.category} aria-describedby="tk-category-note">
                    <option value="">Choose a category</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p id="tk-category-note" className={errors.category ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={errors.category ? "alert" : undefined}>
                    {errors.category ?? (category ? `Goes to the ${category.department} team${category.sensitive ? ". Only you and the people handling it can see this ticket." : "."}` : "The category decides which team handles it.")}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tk-subject">Subject *</Label>
                  <Input id="tk-subject" value={subject} maxLength={150} placeholder="e.g. My 12 Nov time log shows the wrong hours" onChange={(e) => { setSubject(e.target.value); setErrors((x) => ({ ...x, subject: undefined })); }} aria-invalid={!!errors.subject} aria-describedby={errors.subject ? "tk-subject-error" : undefined} />
                  {errors.subject && (
                    <p id="tk-subject-error" role="alert" className="text-sm text-destructive">
                      {errors.subject}
                    </p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tk-description">Description</Label>
                  <RichText id="tk-description" value={description} onChange={setDescription} maxLength={5000} rows={6} placeholder="What happened? What did you expect? Steps to see it help us fix it faster." />
                </div>

                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  <div className="grid gap-1.5">
                    <Label htmlFor="tk-priority">Priority</Label>
                    <select id="tk-priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="tk-project">Related project</Label>
                    <select id="tk-project" className={selectClass} value={project} onChange={(e) => setProject(e.target.value)}>
                      <option value="">None</option>
                      {data.projects.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tk-log">Related timesheet entry</Label>
                  <select id="tk-log" className={selectClass} value={workLogId} onChange={(e) => pickLog(e.target.value)}>
                    <option value="">None</option>
                    {data.logs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {logLabel(l)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Pick the time log this is about. Its date, hours and project are attached to the ticket.</p>
                </div>

                <div className="grid gap-2">
                  <Label>Attachments</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => filesRef.current?.click()} disabled={busy}>
                      <Paperclip aria-hidden="true" /> Add files
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => shotRef.current?.click()} disabled={busy}>
                      <Camera aria-hidden="true" /> Add screenshot
                    </Button>
                  </div>
                  <input ref={filesRef} type="file" multiple accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose files" onChange={(e) => { addFiles(e.target.files, false); e.target.value = ""; }} />
                  <input ref={shotRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose screenshots" onChange={(e) => { addFiles(e.target.files, true); e.target.value = ""; }} />
                  <p className="text-xs text-muted-foreground">{FILE_TYPES_TEXT}. You can also paste a screenshot with Ctrl+V.</p>
                  {errors.files && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.files}
                    </p>
                  )}
                  {picked.length > 0 && (
                    <ul className="grid gap-1.5">
                      {picked.map((p, i) => (
                        <li key={`${p.file.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                          {p.screenshot && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Screenshot</span>}
                          <span className="text-xs text-muted-foreground">{fmtSize(p.file.size)}</span>
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${p.file.name}`} onClick={() => setPicked((l) => l.filter((_, j) => j !== i))} disabled={busy}>
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {error && (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !data}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
              {busy ? "Submitting..." : "Submit ticket"}
            </Button>
          </SheetFooter>
        </form>
  );
}
