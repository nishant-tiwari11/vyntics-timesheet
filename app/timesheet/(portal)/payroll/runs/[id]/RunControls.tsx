"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, parseMoney } from "@/lib/payroll/money";
import type { RunRow, RunStatus } from "@/lib/payroll/runs";
import {
  addAdjustmentAction,
  deleteAdjustmentAction,
  deleteRunAction,
  finalizeRunAction,
  markPaidAction,
  reopenRunAction,
  setManualLopAction,
  setReviewedAction,
} from "../../runsActions";

// ---------------------------- Workflow buttons ----------------------------

export function RunActions({
  runId,
  status,
  currency,
  totals,
  warnings,
  today,
}: {
  runId: string;
  status: RunStatus;
  currency: string;
  totals: { employees: number; gross: number; net: number };
  warnings: string[];
  today: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"finalize" | "paid" | "reopen" | "delete" | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setDialog(null);
    setError(null);
  };

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
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
      after?.();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <>
          <Button type="button" onClick={() => run(() => setReviewedAction(runId, true), "Marked as reviewed.")} disabled={pending}>
            Mark as reviewed
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialog("delete")} disabled={pending}>
            Delete run
          </Button>
        </>
      )}
      {status === "reviewed" && (
        <>
          <Button type="button" onClick={() => setDialog("finalize")} disabled={pending}>
            Finalize payroll
          </Button>
          <Button type="button" variant="outline" onClick={() => run(() => setReviewedAction(runId, false), "Moved back to draft.")} disabled={pending}>
            Back to draft
          </Button>
        </>
      )}
      {status === "finalized" && (
        <>
          <Button type="button" onClick={() => setDialog("paid")} disabled={pending}>
            Mark as paid
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialog("reopen")} disabled={pending}>
            Reopen
          </Button>
        </>
      )}
      {status === "paid" && (
        <Button type="button" variant="outline" onClick={() => setDialog("reopen")} disabled={pending}>
          Reopen
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {dialog === "finalize" && (
            <>
              <DialogHeader>
                <DialogTitle>Finalize this payroll?</DialogTitle>
                <DialogDescription>
                  The pay is worked out again from the approved data right now, a payslip is stored for each of the {totals.employees} employees, and the run is locked.
                  Employees can then see their payslips.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm">
                Gross <strong className="tabular-nums">{formatMoney(totals.gross, currency)}</strong> · Net <strong className="tabular-nums">{formatMoney(totals.net, currency)}</strong>
              </p>
              {warnings.length > 0 && (
                <ul className="list-disc space-y-1 rounded-md border border-dashed p-3 pl-7 text-sm" role="note">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => run(() => finalizeRunAction(runId), "Payroll finalized.", () => router.refresh())} disabled={pending}>
                  {pending ? "Finalizing..." : "Finalize"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "paid" && (
            <>
              <DialogHeader>
                <DialogTitle>Mark as paid</DialogTitle>
                <DialogDescription>Choose the date the salaries were paid. Employees see it on their payslip.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="paid-on">Paid on</Label>
                <Input id="paid-on" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} disabled={pending} />
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
                <Button type="button" onClick={() => run(() => markPaidAction(runId, paidOn), "Marked as paid.", () => router.refresh())} disabled={pending}>
                  {pending ? "Saving..." : "Mark as paid"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "reopen" && (
            <>
              <DialogHeader>
                <DialogTitle>Reopen this run?</DialogTitle>
                <DialogDescription>
                  Employees stop seeing these payslips until you finalize again. The old payslips are kept as history, and your reason is written to the activity log.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="reopen-reason">Reason</Label>
                <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="For example: a bonus was missed" disabled={pending} />
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
                <Button type="button" variant="destructive" onClick={() => run(() => reopenRunAction(runId, reason), "Run reopened.", () => router.refresh())} disabled={pending}>
                  {pending ? "Reopening..." : "Reopen run"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete this draft run?</DialogTitle>
                <DialogDescription>Its adjustments are removed too. Nothing has been paid or stored yet.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Keep
                </Button>
                <Button type="button" variant="destructive" onClick={() => run(() => deleteRunAction(runId), "Run deleted.", () => router.push("/timesheet/payroll/runs"))} disabled={pending}>
                  {pending ? "Deleting..." : "Delete run"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------- One employee: lines, adjustments, loss of pay ----------------------------

const KINDS = [
  { id: "bonus", label: "Bonus" },
  { id: "arrears", label: "Arrears" },
  { id: "reimbursement", label: "Reimbursement" },
  { id: "deduction", label: "One-off deduction" },
] as const;

export function EmployeeDetails({ runId, row, currency, locked }: { runId: string; row: RunRow; currency: string; locked: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("bonus");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [lop, setLop] = useState(String(row.manualLopDays));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = row.payslip;

  function addAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const paise = parseMoney(amount);
    if (!label.trim()) return setError("Enter a label.");
    if (paise === null || paise === 0) return setError("Enter an amount like 5000 or 5000.50.");
    startTransition(async () => {
      const res = await addAdjustmentAction(runId, row.userId, { kind, label, amount: paise });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Adjustment added.");
      setLabel("");
      setAmount("");
    });
  }

  function saveLop() {
    setError(null);
    const days = Number(lop);
    if (!Number.isInteger(days) || days < 0 || days > 31) return setError("Enter whole days from 0 to 31.");
    startTransition(async () => {
      const res = await setManualLopAction(runId, row.userId, days);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Loss of pay days saved.");
    });
  }

  const lines = (title: string, items: { code: string; label: string; amount: number }[]) => (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="grid gap-0.5 text-sm">
          {items.map((l, i) => (
            <li key={`${l.code}-${i}`} className="flex justify-between gap-3">
              <span>{l.label}</span>
              <span className="tabular-nums">{formatMoney(l.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`${locked ? "Details" : "Adjust"} for ${row.name}`}>
        {locked ? "Details" : "Adjust"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{row.name}</DialogTitle>
            <DialogDescription>
              {p.payableDays} payable of {p.baseDays} days · {p.lopDays} LOP · {p.absentDays} absent · {p.paidLeaveDays} paid leave · {p.compOffLeaveDays} comp-off leave
            </DialogDescription>
          </DialogHeader>

          {p.warnings.length > 0 && (
            <ul className="list-disc space-y-1 rounded-md border border-dashed p-3 pl-7 text-sm" role="note">
              {p.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {row.pending.length > 0 && !locked && <p className="text-sm text-muted-foreground">Still waiting for approval, not counted: {row.pending.join(", ")}.</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            {lines("Earnings", p.earnings)}
            {lines("Deductions", p.deductions)}
          </div>
          <p className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm">
            <span>
              Gross <strong className="tabular-nums">{formatMoney(p.gross, currency)}</strong>
            </span>
            <span>
              Deductions <strong className="tabular-nums">{formatMoney(p.totalDeductions, currency)}</strong>
            </span>
            <span>
              Net pay <strong className="tabular-nums">{formatMoney(p.net, currency)}</strong>
            </span>
          </p>

          {!locked && (
            <div className="grid gap-5 border-t pt-4">
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">One-off adjustments</h3>
                {row.adjustments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {row.adjustments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3">
                        <span>
                          {KINDS.find((k) => k.id === a.kind)?.label}: {a.label} · <span className="tabular-nums">{formatMoney(a.amount, currency)}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await deleteAdjustmentAction(runId, a.id);
                              if (!res.ok) toast.error(res.error);
                              else toast.success("Adjustment removed.");
                            })
                          }
                          aria-label={`Remove ${a.label}`}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={addAdjustment} noValidate className="grid gap-3 sm:grid-cols-[10rem_1fr_8rem_auto] sm:items-end">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`adj-kind-${row.userId}`}>Type</Label>
                    <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)} disabled={pending}>
                      <SelectTrigger id={`adj-kind-${row.userId}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`adj-label-${row.userId}`}>Label</Label>
                    <Input id={`adj-label-${row.userId}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={pending} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`adj-amount-${row.userId}`}>Amount</Label>
                    <Input id={`adj-amount-${row.userId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
                  </div>
                  <Button type="submit" disabled={pending}>
                    Add
                  </Button>
                </form>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`lop-${row.userId}`}>Extra loss of pay days</Label>
                <div className="flex items-center gap-2">
                  <Input id={`lop-${row.userId}`} inputMode="numeric" className="w-24" value={lop} onChange={(e) => setLop(e.target.value)} disabled={pending} aria-describedby={`lop-hint-${row.userId}`} />
                  <Button type="button" variant="outline" onClick={saveLop} disabled={pending}>
                    Save
                  </Button>
                </div>
                <p id={`lop-hint-${row.userId}`} className="text-xs text-muted-foreground">
                  Added to the loss of pay worked out from leave and absence, for example an absence nobody reported.
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
