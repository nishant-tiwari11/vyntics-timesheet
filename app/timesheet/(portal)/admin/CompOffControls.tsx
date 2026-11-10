"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompOffSettings } from "@/lib/timesheet/compOffCore";
import type { CompOffReportRow } from "@/lib/timesheet/compOff";
import { decideCompOffAction, saveCompOffSettingsAction } from "./compOffActions";

// ---------------------------- Approve or reject ----------------------------

export function DecideCompOff({ id, who, day, reapproval = false }: { id: string; who: string; day: string; reapproval?: boolean }) {
  const [mode, setMode] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!mode) return;
    startTransition(async () => {
      const res = await decideCompOffAction(id, mode, note);
      if (!res.ok) return void toast.error(res.error);
      toast.success(reapproval ? (mode === "approved" ? "Change approved." : "Original kept.") : mode === "approved" ? "Comp-off approved." : "Comp-off rejected.");
      setMode(null);
      setNote("");
    });
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" onClick={() => setMode("approved")} aria-label={`Approve comp-off for ${who}, ${day}`}>
          {reapproval ? "Approve change" : "Approve"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setMode("rejected")} aria-label={`${reapproval ? "Keep the original comp-off for" : "Reject comp-off for"} ${who}, ${day}`}>
          {reapproval ? "Keep original" : "Reject"}
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reapproval ? (mode === "approved" ? "Approve the change?" : "Keep the original credit?") : mode === "approved" ? "Approve comp-off?" : "Reject comp-off?"}</DialogTitle>
            <DialogDescription>
              {who} worked on {day}.{" "}
              {reapproval
                ? mode === "approved"
                  ? "The credit changes to the new amount. A credit already used for leave can't be reduced."
                  : "The approved credit stays as it was, and the change is dismissed."
                : mode === "approved"
                  ? "The credit is added to their balance and starts counting down to its expiry."
                  : "They will see your note, and can ask again."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="co-note">Note (optional)</Label>
            <Textarea id="co-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} disabled={pending} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMode(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant={mode === "rejected" && !reapproval ? "destructive" : "default"} onClick={confirm} disabled={pending}>
              {pending ? "Saving..." : reapproval ? (mode === "approved" ? "Approve change" : "Keep original") : mode === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- Rules ----------------------------

export function CompOffSettingsForm({ settings }: { settings: CompOffSettings }) {
  const [half, setHalf] = useState(String(settings.halfDayHours));
  const [full, setFull] = useState(String(settings.fullDayHours));
  const [expiry, setExpiry] = useState(String(settings.expiryDays));
  const [cap, setCap] = useState(String(settings.monthlyCap));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { halfDayHours: Number(half), fullDayHours: Number(full), expiryDays: Number(expiry), monthlyCap: Number(cap) };
    if (Object.values(input).some((n) => !Number.isFinite(n))) return setError("Enter a number in every box.");
    if (input.fullDayHours < input.halfDayHours) return setError("Hours for a full day must be at least the half day hours.");
    startTransition(async () => {
      const res = await saveCompOffSettingsAction(input);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Comp-off rules saved.");
    });
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, hint: string, step = "1") => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => set(e.target.value)} disabled={pending} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {field("cs-half", "Half day (hours)", half, setHalf, "Worked at least this much earns 0.5 day.", "0.25")}
        {field("cs-full", "Full day (hours)", full, setFull, "Worked at least this much earns 1 day.", "0.25")}
        {field("cs-expiry", "Expires after (days)", expiry, setExpiry, "Counted from the approval date.")}
        {field("cs-cap", "Monthly limit (days)", cap, setCap, "Most one person can earn per month. 0 = no limit.", "0.5")}
      </div>
      <p className="text-sm text-muted-foreground">Requests are approved by admins. Changes apply to new requests and approvals, not to credits already approved.</p>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save rules"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------- CSV export ----------------------------

const cell = (v: string | number) => {
  const text = String(v);
  // Quote anything with a comma, quote or line break; double any quotes. Also defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function ExportReport({ rows }: { rows: CompOffReportRow[] }) {
  function download() {
    const lines = [
      ["Employee", "Email", "Earned (days)", "Used (days)", "Expired (days)", "Available (days)", "Expiring in 14 days (days)"],
      ...rows.map((r) => [r.name, r.email, r.earned, r.used, r.expired, r.available, r.expiringSoon]),
    ].map((l) => l.map(cell).join(","));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comp-off-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
      <Download aria-hidden="true" /> Export CSV
    </Button>
  );
}
