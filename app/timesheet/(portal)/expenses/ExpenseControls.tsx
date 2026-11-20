"use client";

import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  const room = BILL_MAX_PER_CLAIM - billCount;
  const picked = categories.find((c) => c.id === categoryId);

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
          <Input id="exp-amount" inputMode="decimal" placeholder="450.00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} className="max-md:min-h-11" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="exp-description">Description</Label>
        <Textarea id="exp-description" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="For example: Taxi to the client office" disabled={pending} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="exp-bill">Bill or receipt (optional)</Label>
        <Input
          id="exp-bill"
          type="file"
          multiple
          accept={BILL_ACCEPT}
          disabled={pending || room <= 0}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > room) toast.error(`You can attach ${BILL_MAX_PER_CLAIM} bills to one expense.`);
            setFiles(picked.slice(0, Math.max(room, 0)));
          }}
          className="max-md:min-h-11"
        />
        <p className="text-xs text-muted-foreground">
          {BILL_TYPES_TEXT}. Up to {BILL_MAX_PER_CLAIM} per expense. Only you and the admins who approve it can see your bills.
        </p>
        {files.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {files.map((f) => (
              <li key={f.name + f.size}>
                {f.name} ({fmtSize(f.size)})
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="max-md:min-h-11">
          {pending ? "Saving..." : "Submit for approval"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)} className="max-md:min-h-11">
          Save as draft
        </Button>
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
