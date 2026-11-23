"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOC_MAX_BYTES, STATUS_LABEL, acceptAttrFor, categoryLabel, fmtSize, kindFromName, kindSuits } from "@/lib/documents/config";
import type { DocRow } from "@/lib/documents/server";

// "Pending review" read like something was still missing; for the employee a file that is in just means "uploaded".
export function DocStatus({ doc }: { doc: DocRow }) {
  return (
    <Badge variant={doc.status === "verified" ? "default" : doc.status === "rejected" ? "destructive" : "outline"}>{doc.status === "pending" ? "Uploaded" : STATUS_LABEL[doc.status]}</Badge>
  );
}

/** One file to upload: shows what is there, lets you add, replace or remove it. */
export function UploadSlot({ category, label, hint, docs, multiple, locked, replaceable }: { category: string; label: string; hint: string; docs: DocRow[]; multiple?: boolean; locked: boolean; replaceable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const mine = docs.filter((d) => d.category === category);

  async function send(file: File, replaceId?: string) {
    const kind = kindFromName(file.name);
    if (!kind || !kindSuits(category, kind)) return toast.error(category === "passport_photo" ? "Please choose a JPG or PNG photo." : "Please choose a PDF file.");
    if (file.size > DOC_MAX_BYTES) return toast.error("That file is over 10 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("category", category);
    form.set("name", categoryLabel(category));
    if (replaceId) form.set("replaceId", replaceId);
    setBusy(true);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) toast.error(body.error ?? "Couldn't upload. Please try again.");
      else {
        toast.success("Uploaded.");
        router.refresh();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
    setReplacing(null);
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/api/documents?id=${id}`, { method: "DELETE" }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined;
    if (!res?.ok || !body?.ok) toast.error(body?.error ?? "Couldn't remove it. Please try again.");
    else router.refresh();
    setBusy(false);
  }

  const canAdd = !locked && (multiple || mine.length === 0);

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {canAdd && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {mine.length === 0 ? "Choose file" : "Add another"}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={acceptAttrFor(category)}
        multiple={multiple && !replacing}
        aria-label={`Upload ${label}`}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          for (const f of files) await send(f, replacing ?? undefined);
        }}
      />
      {mine.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing uploaded yet.</p>
      ) : (
        <ul className="grid gap-2">
          {mine.map((d) => (
            <li key={d.id} className="grid gap-1 rounded-md bg-muted/50 p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{d.filename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(d.size)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <DocStatus doc={d} />
                  {d.status === "rejected" && replaceable && (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => (setReplacing(d.id), input.current?.click())}>
                      Upload a new one
                    </Button>
                  )}
                  {!locked && d.status !== "verified" && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(d.id)} aria-label={`Remove ${d.filename}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </span>
              </div>
              {d.status === "rejected" && d.statusReason && <p className="text-xs text-destructive">HR says: {d.statusReason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

