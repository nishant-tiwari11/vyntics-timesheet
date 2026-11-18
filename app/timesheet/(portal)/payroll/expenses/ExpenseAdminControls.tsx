"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { MonthChoice } from "@/lib/expenses/server";
import type { CategoryRow, ClaimRow } from "@/lib/expenses/types";
import { formatMoney, parseMoney, toRupeeText } from "@/lib/payroll/money";
import { HistoryButton } from "../../expenses/ExpenseControls";
import { approveClaimAction, rejectClaimAction, removeFromRunAction, saveCategoryAction } from "../expensesActions";

// ---------------------------- Approve, reject, remove from payroll ----------------------------

export function ClaimDecision({ claim, category, months, defaultMonth }: { claim: ClaimRow; category: CategoryRow | undefined; months: MonthChoice[]; defaultMonth: string }) {
  const limit = category?.limit ?? null;
  const cap = limit === null ? claim.claimed : Math.min(claim.claimed, limit);
  const [dialog, setDialog] = useState<"approve" | "reject" | "remove" | null>(null);
  const [amount, setAmount] = useState(toRupeeText(cap));
  const [month, setMonth] = useState(defaultMonth);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setDialog(null);
    setError(null);
  };

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null);
    startTransition(async () => {
      const res = await task();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      close();
    });
  }

  function approve() {
    const paise = parseMoney(amount);
    if (paise === null || paise === 0) return setError("Enter the amount to approve, like 450 or 450.50.");
    if (paise > claim.claimed) return setError(`You can't approve more than the ${formatMoney(claim.claimed)} that was claimed.`);
    if (limit !== null && paise > limit) return setError(`The limit for ${category?.name} is ${formatMoney(limit)} per claim.`);
    if (!month) return setError("Choose the payroll month.");
    run(async () => {
      const res = await approveClaimAction(claim.id, paise, month, note);
      return res;
    }, "Approved. It will be paid with that month's salary.");
  }

  const canRemove = claim.status === "added_to_payroll";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {claim.status === "pending" && (
        <>
          <Button type="button" size="sm" onClick={() => setDialog("approve")} aria-label={`Approve ${claim.code}`}>
            Approve
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog("reject")} aria-label={`Reject ${claim.code}`}>
            Reject
          </Button>
        </>
      )}
      {canRemove && (
        <Button type="button" size="sm" variant="outline" onClick={() => setDialog("remove")} aria-label={`Remove ${claim.code} from payroll`}>
          Remove from payroll
        </Button>
      )}
      {claim.status === "reimbursed" && <span className="self-center text-xs text-muted-foreground">Locked</span>}
      <HistoryButton claimId={claim.id} code={claim.code} />

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {dialog === "approve" && (
            <>
              <DialogHeader>
                <DialogTitle>Approve {claim.code}</DialogTitle>
                <DialogDescription>
                  {claim.employee} claimed {formatMoney(claim.claimed)} for {claim.category}. Only the amount you approve is added to their salary.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`approve-amount-${claim.id}`}>Amount to approve</Label>
                  <Input id={`approve-amount-${claim.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
                  {limit !== null && (
                    <p className="text-xs text-muted-foreground">
                      {category?.name} has a limit of {formatMoney(limit)} per claim{claim.claimed > limit ? `, so the most you can approve here is ${formatMoney(limit)}` : ""}.
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`approve-month-${claim.id}`}>Add to payroll month</Label>
                  <Select value={month} onValueChange={setMonth} disabled={pending}>
                    <SelectTrigger id={`approve-month-${claim.id}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.month} value={m.month} disabled={m.disabled}>
                          {m.label}
                          {m.reason ? ` (${m.reason})` : m.month === defaultMonth ? " (current open month)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">A month whose payroll is already finalized can&apos;t be chosen.</p>
                </div>
                {category?.taxable && <p className="rounded-md border border-dashed p-2 text-xs">This category is taxable, so it is paid as part of taxable earnings.</p>}
                <div className="grid gap-1.5">
                  <Label htmlFor={`approve-note-${claim.id}`}>Note (optional)</Label>
                  <Textarea id={`approve-note-${claim.id}`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
                </div>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" onClick={approve} disabled={pending}>
                  {pending ? "Approving..." : "Approve"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "reject" && (
            <>
              <DialogHeader>
                <DialogTitle>Reject {claim.code}</DialogTitle>
                <DialogDescription>The employee sees your reason. A rejected expense never affects salary.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor={`reject-note-${claim.id}`}>Reason</Label>
                <Textarea id={`reject-note-${claim.id}`} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="For example: no receipt, or not a work expense" />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={() => run(() => rejectClaimAction(claim.id, note), "Rejected.")} disabled={pending}>
                  {pending ? "Rejecting..." : "Reject"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "remove" && (
            <>
              <DialogHeader>
                <DialogTitle>Remove {claim.code} from this payroll?</DialogTitle>
                <DialogDescription>It goes back to Approved and is added to the next month&apos;s payroll instead. Nothing is lost.</DialogDescription>
              </DialogHeader>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Keep
                </Button>
                <Button type="button" onClick={() => run(() => removeFromRunAction(claim.id), "Moved to the next payroll.")} disabled={pending}>
                  {pending ? "Removing..." : "Remove"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------- Categories ----------------------------

export function CategoryEditor({ category }: { category?: CategoryRow }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [limit, setLimit] = useState(category?.limit != null ? toRupeeText(category.limit) : "");
  const [taxable, setTaxable] = useState(category?.taxable ?? false);
  const [enabled, setEnabled] = useState(category?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const paise = limit.trim() === "" ? null : parseMoney(limit);
    if (!name.trim()) return setError("Enter a name.");
    if (limit.trim() !== "" && (paise === null || paise === 0)) return setError("Enter a limit like 5000, or leave it empty for no limit.");
    startTransition(async () => {
      const res = await saveCategoryAction({ id: category?.id, name, limit: paise, taxable, enabled });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Category saved.");
      setOpen(false);
      if (!category) {
        setName("");
        setLimit("");
        setTaxable(false);
        setEnabled(true);
      }
    });
  }

  const id = category?.id ?? "new";
  return (
    <>
      <Button type="button" size="sm" variant={category ? "outline" : "default"} onClick={() => setOpen(true)}>
        {category ? "Edit" : "Add category"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{category ? `Edit ${category.name}` : "New expense category"}</DialogTitle>
            <DialogDescription>The limit applies to one claim. Only the approved amount is ever paid.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`cat-name-${id}`}>Name</Label>
              <Input id={`cat-name-${id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cat-limit-${id}`}>Limit per claim (optional)</Label>
              <Input id={`cat-limit-${id}`} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" disabled={pending} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-0.5">
                <Label htmlFor={`cat-taxable-${id}`}>Taxable</Label>
                <p className="text-xs text-muted-foreground">Off by default. When on, claims in this category are paid as ordinary taxable earnings. Otherwise they stay outside tax, PF and ESI.</p>
              </div>
              <Switch id={`cat-taxable-${id}`} checked={taxable} onCheckedChange={setTaxable} disabled={pending} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`cat-enabled-${id}`}>Employees can choose it</Label>
              <Switch id={`cat-enabled-${id}`} checked={enabled} onCheckedChange={setEnabled} disabled={pending} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
