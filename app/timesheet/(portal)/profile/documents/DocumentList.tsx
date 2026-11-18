"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Download, Eye, FileText, Loader2, Lock, LockOpen, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, STATUS_LABEL, expiryState, fmtSize, type DocStatus } from "@/lib/documents/config";
import type { DocRow } from "@/lib/documents/server";
import { formatInstantDate, formatYmd } from "@/lib/timesheet/dates";
import { setVisibilityAction } from "../../admin/documents/actions";
import { ReviewDialog, type ReviewTarget } from "./ReviewDialog";

const ALL = "__all__";

export function StatusBadge({ status }: { status: DocStatus }) {
  return (
    <Badge variant={status === "verified" ? "default" : status === "rejected" ? "destructive" : "outline"}>{STATUS_LABEL[status]}</Badge>
  );
}

function Dates({ doc, today }: { doc: DocRow; today: string }) {
  const state = expiryState(doc.expiryDate, today);
  return (
    <>
      {doc.issueDate && <span>Issued {formatYmd(doc.issueDate, { day: "numeric", month: "short", year: "numeric" })}</span>}
      {doc.expiryDate && (
        <span className={state === "expired" ? "font-medium text-destructive" : state === "soon" ? "font-medium text-foreground" : ""}>
          {state === "expired" ? "Expired " : state === "soon" ? "Expires soon, " : "Expires "}
          {formatYmd(doc.expiryDate, { day: "numeric", month: "short", year: "numeric" })}
        </span>
      )}
    </>
  );
}

function Row({
  doc,
  today,
  isAdmin,
  canReplace,
  canDelete,
  old,
  onPreview,
  onReplace,
  onDelete,
  onReview,
  onVisibility,
}: {
  doc: DocRow;
  today: string;
  isAdmin: boolean;
  canReplace: boolean;
  canDelete: boolean;
  /** An older version: only Preview and Download. */
  old?: boolean;
  onPreview: (d: DocRow) => void;
  onReplace: (d: DocRow) => void;
  onDelete: (d: DocRow) => void;
  onReview: (d: DocRow, decision: "verified" | "rejected") => void;
  onVisibility: (d: DocRow) => void;
}) {
  return (
    <li className={`grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center ${old ? "bg-muted/40 text-muted-foreground" : ""}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium break-words text-foreground">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">{doc.name}</span>
          {doc.version > 1 && <span className="text-xs font-normal text-muted-foreground">v{doc.version}</span>}
          {doc.visibility === "hr_only" && (
            <Badge variant="outline" className="gap-1">
              <Lock aria-hidden="true" /> HR only
            </Badge>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={doc.filename}>
          {doc.filename} · {fmtSize(doc.size)}
        </p>
        {(doc.issueDate || doc.expiryDate) && (
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <Dates doc={doc} today={today} />
          </p>
        )}
        {doc.notes && <p className="mt-0.5 text-xs break-words text-muted-foreground">{doc.notes}</p>}
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="md:hidden">Uploaded by </span>
        {doc.uploadedBy}
        <span className="block">{formatInstantDate(doc.createdAt)}</span>
      </div>

      <div className="grid gap-1 justify-items-start">
        <StatusBadge status={doc.status} />
        {doc.status === "rejected" && doc.statusReason && <span className="text-xs break-words text-destructive">{doc.statusReason}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1 md:justify-end">
        <Button type="button" variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Preview ${doc.name}`} onClick={() => onPreview(doc)}>
          <Eye />
        </Button>
        <Button asChild variant="outline" size="icon-sm" className="max-md:size-11">
          <a href={`/api/documents/${doc.id}/download`} aria-label={`Download ${doc.name}`}>
            <Download />
          </a>
        </Button>
        {!old && isAdmin && doc.status !== "verified" && (
          <Button type="button" variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Verify ${doc.name}`} onClick={() => onReview(doc, "verified")}>
            <Check />
          </Button>
        )}
        {!old && isAdmin && doc.status !== "rejected" && (
          <Button type="button" variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Reject ${doc.name}`} onClick={() => onReview(doc, "rejected")}>
            <X />
          </Button>
        )}
        {!old && isAdmin && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="max-md:size-11"
            aria-label={doc.visibility === "hr_only" ? `Make ${doc.name} visible to the employee` : `Make ${doc.name} HR only`}
            title={doc.visibility === "hr_only" ? "HR only. Click to show the employee." : "Visible to employee. Click to make HR only."}
            onClick={() => onVisibility(doc)}
          >
            {doc.visibility === "hr_only" ? <Lock /> : <LockOpen />}
          </Button>
        )}
        {!old && canReplace && (
          <Button type="button" variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Replace ${doc.name}`} onClick={() => onReplace(doc)}>
            <RefreshCw />
          </Button>
        )}
        {!old && canDelete && (
          <Button type="button" variant="outline" size="icon-sm" className="text-destructive max-md:size-11" aria-label={`Delete ${doc.name}`} onClick={() => onDelete(doc)}>
            <Trash2 />
          </Button>
        )}
      </div>
      {isAdmin && old && <span className="sr-only">Older version</span>}
    </li>
  );
}

// The documents, grouped by category, with search and filters. Replace keeps the old version (admins can open the
// history); Delete asks first. Employees can't delete a verified document.
export function DocumentList({
  docs,
  versions,
  today,
  isAdmin,
  canEdit,
  onPreview,
  onReplace,
}: {
  docs: DocRow[];
  versions: Record<string, DocRow[]>;
  today: string;
  isAdmin: boolean;
  /** This is your own profile and you can change it (an admin can always change). */
  canEdit: boolean;
  onPreview: (d: DocRow) => void;
  onReplace: (d: DocRow) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewTarget | null>(null);

  const needle = q.trim().toLowerCase();
  const shown = docs.filter(
    (d) =>
      (category === ALL || d.category === category) &&
      (status === ALL || d.status === status) &&
      (!needle || `${d.name} ${d.filename} ${d.notes}`.toLowerCase().includes(needle))
  );
  const groups = CATEGORIES.map((c) => ({ category: c, rows: shown.filter((d) => d.category === c.id) })).filter((g) => g.rows.length > 0);

  const canReplace = (d: DocRow) => isAdmin || (canEdit && d.visibility === "employee");
  const canDelete = (d: DocRow) => isAdmin || (canEdit && d.visibility === "employee" && d.status !== "verified");

  async function toggleVisibility(d: DocRow) {
    const res = await setVisibilityAction(d.id, d.visibility === "hr_only" ? "employee" : "hr_only");
    if (res.ok) {
      toast.success(res.message ?? "Saved.");
      router.refresh();
    } else toast.error(res.error);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents?id=${deleting.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Couldn't delete the document. Please try again.");
      } else {
        toast.success("Document deleted.");
        setDeleting(null);
        router.refresh();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="docs-title" className="grid gap-3">
      <h2 id="docs-title" className="text-base font-semibold">
        Documents <span className="font-normal text-muted-foreground">({docs.length})</span>
      </h2>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_11rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Search by name or file" aria-label="Search documents" className="pl-9 max-md:h-11" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full max-md:h-11" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full max-md:h-11" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {docs.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No documents yet. Drag files above, or press Upload document.</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground" role="status">
          No documents match these filters.
        </p>
      ) : (
        groups.map(({ category: c, rows }) => (
          <div key={c.id} className="overflow-hidden rounded-xl border bg-card">
            <h3 className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-sm font-semibold">
              <span>{c.label}</span>
              <span className="font-normal text-muted-foreground">{rows.length}</span>
            </h3>
            <ul className="divide-y">
              {rows.map((d) => {
                const older = versions[d.groupId] ?? [];
                const expanded = open.has(d.groupId);
                return (
                  <li key={d.id} className="list-none">
                    <ul>
                      <Row doc={d} today={today} isAdmin={isAdmin} canReplace={canReplace(d)} canDelete={canDelete(d)} onPreview={onPreview} onReplace={onReplace} onDelete={setDeleting} onReview={(x, decision) => setReview({ id: x.id, name: x.name, decision })} onVisibility={toggleVisibility} />
                      {isAdmin && older.length > 0 && (
                        <>
                          <li className="px-4 pb-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              aria-expanded={expanded}
                              onClick={() => setOpen((s) => (s.has(d.groupId) ? new Set([...s].filter((x) => x !== d.groupId)) : new Set(s).add(d.groupId)))}
                            >
                              {expanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                              Version history ({older.length} older)
                            </button>
                          </li>
                          {expanded &&
                            older.map((v) => (
                              <Row key={v.id} doc={v} today={today} isAdmin old canReplace={false} canDelete={false} onPreview={onPreview} onReplace={onReplace} onDelete={setDeleting} onReview={() => {}} onVisibility={() => {}} />
                            ))}
                        </>
                      )}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      <p className="text-xs text-muted-foreground">Documents are private. Only you and HR can open them.</p>

      <ReviewDialog target={review} onClose={() => setReview(null)} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleting?.name}&rdquo; and all its earlier versions will be removed. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={confirmDelete}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
