"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { creditForHours, daysText, type CompOffSettings } from "@/lib/timesheet/compOffCore";
import { isWeekend } from "@/lib/timesheet/dates";
import { cancelCompOffAction, earnCompOffAction, hoursOnDateAction } from "./compOffActions";

type Errors = Partial<Record<"date" | "hours", string>>;

// ---------------------------- Earn comp-off ----------------------------

function EarnForm({ today, settings, offDays, onClose }: { today: string; settings: CompOffSettings; offDays: string[]; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eligible = (d: string) => isWeekend(d) || offDays.includes(d);
  const credit = creditForHours(Number(hours), settings);

  function onDate(value: string) {
    setDate(value);
    setNote(null);
    setErrors((e) => ({ ...e, date: undefined }));
    if (!value) return;
    if (value > today) return setErrors({ date: "You can only ask for a day you have already worked." });
    if (!eligible(value)) return setErrors({ date: "Comp-off is only for work on a weekend, a public holiday or a festival day." });
    // Pre-fill the hours from your time log for that day, if there is one.
    startTransition(async () => {
      const res = await hoursOnDateAction(value);
      if (res.ok && res.hours && res.hours > 0) {
        setHours(String(res.hours));
        setNote(`Filled in from your time log for that day (${res.hours} h). You can change it.`);
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: Errors = {};
    if (!date) found.date = "Choose the day you worked.";
    else if (date > today) found.date = "You can only ask for a day you have already worked.";
    else if (!eligible(date)) found.date = "Comp-off is only for work on a weekend, a public holiday or a festival day.";
    const h = Number(hours);
    if (!hours || !Number.isFinite(h) || h <= 0 || h > 24) found.hours = "Enter the hours you worked, between 0 and 24.";
    else if (creditForHours(h, settings) === 0) found.hours = `Work at least ${settings.halfDayHours} hours for a half day.`;
    setErrors(found);
    if (found.date || found.hours) return;

    startTransition(async () => {
      const res = await earnCompOffAction({ workDate: date, hours: h, reason });
      if (!res.ok) {
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Comp-off request sent. Your admin will review it.");
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Earn comp-off</DialogTitle>
        <DialogDescription>
          For work on a weekend, public holiday or festival day. {settings.halfDayHours} hours or more earns a half day, {settings.fullDayHours} hours or more a full day.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="co-date">
          Day you worked <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input id="co-date" type="date" value={date} max={today} onChange={(e) => onDate(e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "co-date-error" : undefined} disabled={pending} />
        {errors.date && (
          <p id="co-date-error" role="alert" className="text-sm font-medium text-destructive">
            {errors.date}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="co-hours">
          Hours worked <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="co-hours"
          type="number"
          inputMode="decimal"
          min={0.25}
          max={24}
          step={0.25}
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            setErrors((x) => ({ ...x, hours: undefined }));
          }}
          aria-invalid={!!errors.hours}
          aria-describedby={errors.hours ? "co-hours-error" : "co-hours-hint"}
          disabled={pending}
        />
        {errors.hours ? (
          <p id="co-hours-error" role="alert" className="text-sm font-medium text-destructive">
            {errors.hours}
          </p>
        ) : (
          <p id="co-hours-hint" className="text-sm text-muted-foreground">
            {note ?? (credit > 0 ? `You would earn ${daysText(credit)} of comp-off.` : "Hours are checked against the half and full day rules.")}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="co-reason">Reason (optional)</Label>
        <Textarea id="co-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="What did you work on?" disabled={pending} />
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
          {pending ? "Sending..." : "Send request"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EarnCompOffButton({ today, settings, offDays }: { today: string; settings: CompOffSettings; offDays: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> Earn comp-off
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <EarnForm today={today} settings={settings} offDays={offDays} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- Cancel a pending request ----------------------------

export function CancelCompOff({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await cancelCompOffAction(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Comp-off request cancelled.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`Cancel the comp-off request for ${label}`}>
        Cancel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>Your comp-off request for {label} will be withdrawn. You can ask again later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep request
            </Button>
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? "Cancelling..." : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
