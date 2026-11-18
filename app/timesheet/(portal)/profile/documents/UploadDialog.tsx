"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, DOC_MAX_BYTES, checkMeta, fmtSize, kindFromName, nameFromFile, categoryLabel, type Visibility } from "@/lib/documents/config";

type Item = {
  key: string;
  file: File;
  category: string;
  name: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  visibility: Visibility;
  progress: number;
  state: "idle" | "uploading" | "done" | "error";
  error: string;
};

let counter = 0;

function problemWith(file: File): string {
  if (!kindFromName(file.name)) return "Only PDF, DOC, DOCX, JPG and PNG files are allowed.";
  if (file.size > DOC_MAX_BYTES) return `This file is ${fmtSize(file.size)}. The limit is 10 MB.`;
  if (file.size === 0) return "This file is empty.";
  return "";
}

/** Send one file. XMLHttpRequest, because fetch can't report upload progress. */
function send(item: Item, userId: string, replaceId: string | undefined, onProgress: (pct: number) => void): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.set("file", item.file);
    form.set("category", item.category);
    form.set("name", item.name);
    form.set("issueDate", item.issueDate);
    form.set("expiryDate", item.expiryDate);
    form.set("notes", item.notes);
    form.set("userId", userId);
    form.set("visibility", item.visibility);
    if (replaceId) form.set("replaceId", replaceId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    xhr.onload = () => {
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON: fall through to the generic message */
      }
      resolve(xhr.status >= 200 && xhr.status < 300 && body.ok ? { ok: true, error: "" } : { ok: false, error: body.error ?? "The upload failed. Please try again." });
    };
    xhr.send(form);
  });
}

// Choose a category for each file, add the details, and upload them one after another with a progress bar each.
// Mount it with a `key` per batch so its form starts fresh. With `replace`, the file becomes a new version of that document.
export function UploadDialog({
  files,
  userId,
  isAdmin,
  presetCategory,
  replace,
  onClose,
}: {
  files: File[];
  userId: string;
  isAdmin: boolean;
  presetCategory?: string;
  replace?: { id: string; category: string; name: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() =>
    files.map((file) => ({
      key: `f${++counter}`,
      file,
      category: replace?.category ?? presetCategory ?? "",
      name: replace?.name ?? nameFromFile(file.name),
      issueDate: "",
      expiryDate: "",
      notes: "",
      visibility: "employee",
      progress: 0,
      state: "idle",
      error: problemWith(file),
    }))
  );
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const patch = (key: string, change: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));

  async function uploadAll() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let failed = 0;
    let sent = 0;
    for (const item of items) {
      if (item.state === "done") continue;
      const bad = problemWith(item.file);
      const meta = checkMeta(item);
      if (bad || !meta.ok) {
        patch(item.key, { state: "error", error: bad || (meta.ok ? "" : meta.error) });
        failed += 1;
        continue;
      }
      patch(item.key, { state: "uploading", progress: 0, error: "" });
      const res = await send(item, userId, replace?.id, (progress) => patch(item.key, { progress }));
      if (res.ok) {
        sent += 1;
        patch(item.key, { state: "done", progress: 100 });
      } else {
        failed += 1;
        patch(item.key, { state: "error", error: res.error });
      }
    }
    running.current = false;
    setBusy(false);
    if (sent > 0) {
      toast.success(sent === 1 ? "Document uploaded." : `${sent} documents uploaded.`);
      router.refresh();
    }
    if (failed === 0) onClose();
    else toast.error(failed === 1 ? "One file couldn't be uploaded. See the message on it." : `${failed} files couldn't be uploaded. See the messages on them.`);
  }

  const remaining = items.filter((i) => i.state !== "done");

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{replace ? "Replace document" : "Upload documents"}</DialogTitle>
          <DialogDescription>
            {replace ? `The new file becomes the current version of "${replace.name}". The old version is kept for admins.` : "PDF, DOC, DOCX, JPG or PNG, up to 10 MB each. Choose a category for every file."}
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-3">
          {items.map((item) => {
            const locked = busy || item.state === "done";
            const id = (f: string) => `${item.key}-${f}`;
            return (
              <li key={item.key} className="grid gap-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium break-all">
                    {item.file.name} <span className="font-normal text-muted-foreground">· {fmtSize(item.file.size)}</span>
                  </p>
                  {item.state === "done" ? (
                    <CheckCircle2 className="size-5 shrink-0" aria-label="Uploaded" />
                  ) : (
                    !busy &&
                    items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((all) => all.filter((i) => i.key !== item.key))}>
                        <X />
                      </Button>
                    )
                  )}
                </div>

                {item.state !== "done" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("cat")}>Category</Label>
                      {replace ? (
                        <p className="flex h-9 items-center text-sm">{categoryLabel(replace.category)}</p>
                      ) : (
                        <Select value={item.category} onValueChange={(v) => patch(item.key, { category: v, error: problemWith(item.file) })} disabled={locked}>
                          <SelectTrigger id={id("cat")} className="w-full">
                            <SelectValue placeholder="Choose a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.label}
                                {c.hint ? ` (${c.hint})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("name")}>Document name</Label>
                      <Input id={id("name")} value={item.name} maxLength={120} disabled={locked} onChange={(e) => patch(item.key, { name: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("issue")}>Issue date (optional)</Label>
                      <Input id={id("issue")} type="date" value={item.issueDate} disabled={locked} onChange={(e) => patch(item.key, { issueDate: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={id("exp")}>Expiry date (optional)</Label>
                      <Input id={id("exp")} type="date" value={item.expiryDate} min={item.issueDate || undefined} disabled={locked} onChange={(e) => patch(item.key, { expiryDate: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
                      <Label htmlFor={id("notes")}>Notes (optional)</Label>
                      <Textarea id={id("notes")} rows={2} maxLength={500} value={item.notes} disabled={locked} onChange={(e) => patch(item.key, { notes: e.target.value })} />
                    </div>
                    {isAdmin && (
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label htmlFor={id("vis")}>Who can see it</Label>
                        <Select value={item.visibility} onValueChange={(v) => patch(item.key, { visibility: v as Visibility })} disabled={locked}>
                          <SelectTrigger id={id("vis")} className="w-full sm:w-72">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Visible to employee</SelectItem>
                            <SelectItem value="hr_only">HR only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {(item.state === "uploading" || item.state === "done") && (
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} aria-label={`Uploading ${item.file.name}`}>
                    <div className="h-full bg-foreground transition-[width]" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.error && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {item.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {remaining.length === 0 ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={uploadAll} disabled={busy || remaining.length === 0}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? "Uploading…" : remaining.length > 1 ? `Upload ${remaining.length} files` : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
