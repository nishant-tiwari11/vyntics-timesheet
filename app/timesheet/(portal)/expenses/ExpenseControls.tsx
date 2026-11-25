"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BILL_ACCEPT, BILL_MAX_PER_CLAIM, BILL_TYPES_TEXT, fmtSize } from "@/lib/expenses/billFile";
import type { CategoryRow, ClaimEvent, ClaimRow } from "@/lib/expenses/types";
import { formatMoney, parseMoney, toRupeeText } from "@/lib/payroll/money";
import { uploadBill } from "./BillsCell";
import { claimHistoryAction, deleteClaimAction, saveClaimAction, submitClaimAction } from "./actions";

// ---------------------------- New or edited claim ----------------------------

export function ClaimForm({ categories, today, claim, billCount = 0, onDone }: { categories: CategoryRow[]; today: string; claim?: ClaimRow; /** Bills already attached to this claim. */ billCount?: number; onDone?: () => void }) {
  const [categoryId, setCategoryId] = useState(claim?.categoryId ?? "");
  const [date, setDate] = useState(claim?.date ?? today);
  const [amount, setAmount] = useState(claim ? toRupeeText(claim.claimed) : "");
  const [description, setDescription] = useState(claim?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const room = BILL_MAX_PER_CLAIM - billCount;
  const picked = categories.find((c) => c.id === categoryId);

  // Add chosen or dropped files to the list, up to what is left of the 5-per-expense limit.
  function addFiles(list: File[]) {
    const next = [...files];
    for (const f of list) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    if (next.length > room) toast.error(`You can attach ${BILL_MAX_PER_CLAIM} bills to one expense.`);
    setFiles(next.slice(0, Math.max(room, 0)));
  }

  function save(submit: boolean) {
    setError(null);
    const paise = parseMoney(amount);
    if (!categoryId) return setError("Choose a category.");
    if (!date) return setError("Choose the date of the expense.");
    if (paise === null || paise === 0) return setError("Enter an amount like 450 or 450.50.");
    if (!description.trim()) return setError("Describe what the money was spent on.");
    startTransition(async () => {
      const res = await saveClaimAction({ id: claim?.id, categoryId, date, description, amount: paise, submit });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(submit ? "Sent for approval." : "Saved as a draft.");
      // Attach the chosen bills to the saved claim. A bill that fails never undoes the claim.
      const claimId = res.id ?? claim?.id;
      if (claimId) {
        for (const file of files) {
          const up = await uploadBill(claimId, file);
          if (!up.ok) toast.error(`${file.name}: ${up.error}`);
        }
      }
      setFiles([]);
      if (!claim) {
        setCategoryId("");
        setAmount("");
        setDescription("");
      }
      onDone?.();
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      className="grid gap-4"
      aria-label={claim ? "Edit expense" : "New expense"}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId} disabled={pending}>
            <SelectTrigger id="exp-category" className="w-full max-md:min-h-11">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {picked?.limit != null && <p className="text-xs text-muted-foreground">Up to {formatMoney(picked.limit)} is paid for one claim in this category.</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-date">Date of expense</Label>
          <Input id="exp-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} disabled={pending} className="max-md:min-h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-amount">Amount</Label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
              ₹
            </span>
            <Input id="exp-amount" inputMode="decimal" placeholder="450.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} className="pl-7 tabular-nums max-md:min-h-11" />
          </div>
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="exp-description">Description</Label>
          <span className="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
            {description.length}/300
          </span>
        </div>
        <Textarea id="exp-description" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For example: Taxi to the client office" disabled={pending} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="exp-bill">Bill or receipt (optional)</Label>
        <input
          ref={fileInput}
          id="exp-bill"
          type="file"
          multiple
          accept={BILL_ACCEPT}
          disabled={pending || room <= 0}
          className="sr-only"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending || room <= 0}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors hover:border-foreground disabled:opacity-50 max-md:min-h-11 ${over ? "border-foreground bg-muted/50" : ""}`}
        >
          <Paperclip className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{room <= 0 ? "This expense already has the most bills" : "Drop a bill here, or click to choose"}</span>
          <span className="text-xs text-muted-foreground">
            {BILL_TYPES_TEXT}. Up to {BILL_MAX_PER_CLAIM} per expense.
          </span>
        </button>
        <p className="text-xs text-muted-foreground">Only you and the admins who approve it can see your bills.</p>
        {files.length > 0 && (
          <ul className="grid gap-1.5" aria-label="Bills to attach">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(f.size)}</span>
                <button type="button" onClick={() => setFiles(files.filter((x) => x !== f))} disabled={pending} aria-label={`Remove ${f.name}`} className="rounded p-1 hover:bg-muted max-md:p-2">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} className="max-md:min-h-11">
          {pending ? "Saving..." : "Submit for approval"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)} className="max-md:min-h-11">
          Save as draft
        </Button>
        <span className="text-xs text-muted-foreground">A draft is not sent until you submit it.</span>
      </div>
    </form>
  );
}

// ---------------------------- History ----------------------------

const ACTIONS: Record<string, string> = {
  created: "Created as a draft",
  submitted: "Submitted for approval",
  edited: "Edited",
  approved: "Approved",
  rejected: "Rejected",
  added_to_payroll: "Added to payroll",
  removed_from_payroll: "Removed from payroll",
  reimbursed: "Reimbursed",
  paid: "Payment date recorded",
  reopened: "Payroll reopened",
  changed: "Changed",
  deleted: "Deleted",
};

/** The audit trail writes amounts in paise; show them as money. */
const readable = (detail: string) => detail.replace(/(\d+) paise/g, (_m, n: string) => formatMoney(Number(n)));

export function HistoryButton({ claimId, code }: { claimId: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ClaimEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setEvents(null);
    setError(null);
    const res = await claimHistoryAction(claimId);
    if (res.ok) setEvents(res.events);
    else setError(res.error);
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={show} aria-label={`History of ${code}`}>
        History
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>History of {code}</DialogTitle>
            <DialogDescription>Who did what, and when.</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!error && events === null && <p className="text-sm text-muted-foreground">Loading...</p>}
          {events && events.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
          {events && events.length > 0 && (
            <ol className="grid gap-3 text-sm">
              {events.map((e) => (
                <li key={e.id} className="grid gap-0.5 border-l-2 pl-3">
                  <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.actor} · {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  {e.detail && <span className="text-xs break-words">{readable(e.detail)}</span>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- A row's buttons ----------------------------

export function RowActions({ claim, categories, today, billCount = 0 }: { claim: ClaimRow; categories: CategoryRow[]; today: string; billCount?: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const draft = claim.status === "draft";

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await task();
      if (!res.ok) toast.error(res.error ?? "Something went wrong.");
      else toast.success(success);
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {draft && (
        <>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => submitClaimAction(claim.id), "Sent for approval.")}>
            Submit
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteClaimAction(claim.id), "Draft deleted.")} aria-label={`Delete ${claim.code}`}>
            Delete
          </Button>
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit {claim.code}</DialogTitle>
                <DialogDescription>You can change a claim until you submit it.</DialogDescription>
              </DialogHeader>
              <ClaimForm categories={categories} today={today} claim={claim} billCount={billCount} onDone={() => setEditing(false)} />
            </DialogContent>
          </Dialog>
        </>
      )}
      <HistoryButton claimId={claim.id} code={claim.code} />
    </div>
  );
}
