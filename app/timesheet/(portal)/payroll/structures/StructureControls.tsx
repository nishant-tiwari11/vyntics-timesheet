"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, parseMoney, toRupeeText } from "@/lib/payroll/money";
import type { EmployeeRow, StructureRow } from "@/lib/payroll/types";
import { formatYmd } from "@/lib/timesheet/dates";
import { addStructureAction, saveEmployeeDetailsAction, structureHistoryAction } from "../actions";

const day = (d: string) => formatYmd(d, { day: "numeric", month: "short", year: "numeric" });

type MoneyKey = "basic" | "hra" | "allowances" | "deductions";
const MONEY_FIELDS: { key: MoneyKey; label: string; required?: boolean; hint?: string }[] = [
  { key: "basic", label: "Basic pay (monthly)", required: true },
  { key: "hra", label: "HRA (monthly)" },
  { key: "allowances", label: "Other allowances (monthly)" },
  { key: "deductions", label: "Fixed deductions (monthly)", hint: "A deduction taken in full every month, such as a loan repayment." },
];

// ---------------------------- New salary structure ----------------------------

function StructureForm({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const start = employee.current;
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [values, setValues] = useState<Record<MoneyKey, string>>({
    basic: start ? toRupeeText(start.basic) : "",
    hra: start ? toRupeeText(start.hra) : "",
    allowances: start ? toRupeeText(start.allowances) : "",
    deductions: start ? toRupeeText(start.deductions) : "",
  });
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<MoneyKey | "date", string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: typeof errors = {};
    if (!effectiveFrom) found.date = "Choose the date this takes effect.";
    const parsed = {} as Record<MoneyKey, number>;
    for (const f of MONEY_FIELDS) {
      const text = values[f.key].trim();
      const n = text === "" && !f.required ? 0 : parseMoney(text);
      if (n === null || (f.required && n === 0)) found[f.key] = f.required ? "Enter the basic pay, like 25000 or 25000.50." : "Enter an amount like 5000 or 5000.50.";
      else parsed[f.key] = n;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const res = await addStructureAction(employee.id, { effectiveFrom, ...parsed, note });
      if (!res.ok) {
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Salary structure added.");
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New salary structure for {employee.name}</DialogTitle>
        <DialogDescription>
          This adds a new entry from the date you choose. The earlier structures stay in the history and are never overwritten.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="ss-date">
          Effective from <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input id="ss-date" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} aria-invalid={!!errors.date} disabled={pending} />
        {errors.date && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errors.date}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MONEY_FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`ss-${f.key}`}>
              {f.label} {f.required && <span aria-hidden="true" className="text-destructive">*</span>}
            </Label>
            <Input
              id={`ss-${f.key}`}
              inputMode="decimal"
              autoComplete="off"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-invalid={!!errors[f.key]}
              aria-describedby={errors[f.key] ? `ss-${f.key}-error` : f.hint ? `ss-${f.key}-hint` : undefined}
              disabled={pending}
            />
            {errors[f.key] ? (
              <p id={`ss-${f.key}-error`} role="alert" className="text-sm font-medium text-destructive">
                {errors[f.key]}
              </p>
            ) : f.hint ? (
              <p id={`ss-${f.key}-hint`} className="text-xs text-muted-foreground">
                {f.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ss-note">Note (optional)</Label>
        <Textarea id="ss-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="For example: annual revision" disabled={pending} />
      </div>

      {formError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Add structure"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------- History ----------------------------

function History({ employee, currency }: { employee: EmployeeRow; currency: string }) {
  const [rows, setRows] = useState<StructureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    structureHistoryAction(employee.id).then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.rows);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [employee.id, attempt]);

  if (error) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            setError(null);
            setRows(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!rows) return <Skeleton className="h-32 w-full" aria-label="Loading history" />;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No salary structure has been added yet.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <caption className="sr-only">Salary structure history for {employee.name}, newest first</caption>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead className="text-right">Basic</TableHead>
            <TableHead className="text-right">HRA</TableHead>
            <TableHead className="text-right">Allowances</TableHead>
            <TableHead className="text-right">Deductions</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{day(r.effectiveFrom)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.basic, currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.hra, currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.allowances, currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.deductions, currency)}</TableCell>
              <TableCell className="min-w-32 whitespace-normal text-muted-foreground">{r.note || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------- Details (joining, leaving, department) ----------------------------

function DetailsForm({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const [joinedOn, setJoinedOn] = useState(employee.joinedOn);
  const [leftOn, setLeftOn] = useState(employee.leftOn ?? "");
  const [department, setDepartment] = useState(employee.department);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!joinedOn) return setError("Enter the joining date.");
    if (leftOn && leftOn < joinedOn) return setError("The leaving date can't be before the joining date.");
    startTransition(async () => {
      const res = await saveEmployeeDetailsAction(employee.id, { joinedOn, leftOn: leftOn || null, department });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Details saved.");
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{employee.name}: employment details</DialogTitle>
        <DialogDescription>The joining and leaving dates decide how much of a month is paid.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ed-joined">
            Joining date <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input id="ed-joined" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ed-left">Last working day (if left)</Label>
          <Input id="ed-left" type="date" value={leftOn} min={joinedOn} onChange={(e) => setLeftOn(e.target.value)} disabled={pending} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ed-dept">Department</Label>
        <Input id="ed-dept" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={80} placeholder="For example: Engineering" disabled={pending} />
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------- Row actions ----------------------------

export function StructureActions({ employee, currency }: { employee: EmployeeRow; currency: string }) {
  const [open, setOpen] = useState<"new" | "history" | "details" | null>(null);
  const close = () => setOpen(null);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button type="button" size="sm" onClick={() => setOpen("new")}>
        New structure
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen("history")}>
        History
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen("details")}>
        Details
      </Button>
      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {open === "new" && <StructureForm employee={employee} onClose={close} />}
          {open === "details" && <DetailsForm employee={employee} onClose={close} />}
          {open === "history" && (
            <>
              <DialogHeader>
                <DialogTitle>{employee.name}: salary history</DialogTitle>
                <DialogDescription>Every structure ever entered. Opening this is recorded in the activity log.</DialogDescription>
              </DialogHeader>
              <History employee={employee} currency={currency} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
