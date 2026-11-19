"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatYmd, mondayOf } from "@/lib/timesheet/dates";
import { WEEKDAYS, offDaysText, type PortalSettings } from "@/lib/timesheet/settings";
import { saveSettingsAction } from "./actions";

const same = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);
const dateText = (ymd: string | null) => (ymd ? formatYmd(ymd, { day: "numeric", month: "short", year: "numeric" }) : "no lock");

// Working time (daily target and weekly off days) and the timesheet lock. Saving first shows exactly what will change, because
// these affect everyone: who counts as "under target", which days are working days, and which time logs can still be edited.
export function SettingsForm({ saved, today }: { saved: PortalSettings; today: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(String(saved.dailyTargetHours));
  const [off, setOff] = useState<number[]>(saved.weeklyOffDays);
  const [locked, setLocked] = useState(saved.lockedThrough ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetNumber = Number(target);
  const problem =
    !target.trim() || !Number.isFinite(targetNumber) || targetNumber <= 0 || targetNumber > 24
      ? "The daily target must be more than 0 and at most 24 hours."
      : off.length > 6
        ? "At least one day of the week must be a working day."
        : locked && locked > today
          ? "The lock date can't be in the future."
          : null;

  const next: PortalSettings = { dailyTargetHours: Math.round(targetNumber * 100) / 100, weeklyOffDays: off, lockedThrough: locked || null };
  const changes = [
    next.dailyTargetHours !== saved.dailyTargetHours && `Daily target: ${saved.dailyTargetHours} h to ${next.dailyTargetHours} h`,
    !same(next.weeklyOffDays, saved.weeklyOffDays) && `Weekly off: ${offDaysText(saved.weeklyOffDays)} to ${offDaysText(next.weeklyOffDays)}`,
    next.lockedThrough !== saved.lockedThrough && `Locked through: ${dateText(saved.lockedThrough)} to ${dateText(next.lockedThrough)}`,
  ].filter((c): c is string => !!c);

  const toggle = (iso: number) => setOff((days) => (days.includes(iso) ? days.filter((d) => d !== iso) : [...days, iso].sort((a, b) => a - b)));
  const lastSunday = addDays(mondayOf(today), -1);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveSettingsAction(next);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setError(res.error);
      return void toast.error(res.error);
    }
    setConfirming(false);
    toast.success("Settings saved. They apply everywhere straight away.");
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <section aria-labelledby="working-time" className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 id="working-time" className="text-base font-semibold">
            Working time
          </h2>
        </div>

        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="target">Daily target (hours)</Label>
          <Input id="target" inputMode="decimal" value={target} maxLength={5} disabled={busy} onChange={(e) => setTarget(e.target.value.replace(",", "."))} className="max-md:h-11" />
          <p className="text-xs text-muted-foreground">How many hours a full working day is expected to have. It decides who is &ldquo;under target&rdquo; on the Dashboard and in Reports.</p>
        </div>

        <fieldset className="grid gap-2" disabled={busy}>
          <legend className="mb-1 text-sm leading-none font-medium">Weekly off days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const isOff = off.includes(d.iso);
              return (
                <button
                  key={d.iso}
                  type="button"
                  aria-pressed={isOff}
                  onClick={() => toggle(d.iso)}
                  className={`min-h-9 min-w-14 rounded-md border px-3 text-sm font-medium transition-colors max-md:min-h-11 ${isOff ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`}
                  title={isOff ? `${d.long} is a weekly off` : `${d.long} is a working day`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Filled days are the weekly off: <strong>{offDaysText(off)}</strong>. Nobody is expected to log on them, they don&apos;t count as working days, and comp-off can be earned for work on them. At least one day must stay a working day.
          </p>
        </fieldset>
      </section>

      <section aria-labelledby="lock" className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 id="lock" className="text-base font-semibold">
            Timesheet lock
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Time logs already lock every Sunday night. Here you can lock earlier days too, for example when payroll is closed: employees can&apos;t add, change or delete any time log dated on or before the day you choose. Admins can still correct anything.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="lock-date">Lock everything up to</Label>
            <Input id="lock-date" type="date" value={locked} max={today} disabled={busy} onChange={(e) => setLocked(e.target.value)} className="w-48 max-md:h-11" />
          </div>
          <Button type="button" variant="outline" className="max-md:min-h-11" disabled={busy} onClick={() => setLocked(lastSunday)}>
            Up to last Sunday ({formatYmd(lastSunday, { day: "numeric", month: "short" })})
          </Button>
          <Button type="button" variant="outline" className="max-md:min-h-11" disabled={busy || !locked} onClick={() => setLocked("")}>
            Clear lock
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{locked ? `Employees can't change time logs dated up to and including ${dateText(locked)}.` : "No extra lock: only the weekly Sunday-night lock applies."}</p>
      </section>

      {(error || problem) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error ?? problem}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="max-md:min-h-11" disabled={busy || !!problem || changes.length === 0} onClick={() => setConfirming(true)}>
          Save changes
        </Button>
        {changes.length === 0 && <p className="text-sm text-muted-foreground">Nothing has changed.</p>}
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !o && !busy && setConfirming(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save these changes?</DialogTitle>
            <DialogDescription>They apply to everyone straight away, and are written to the audit log.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1.5 rounded-md border bg-muted/40 p-3 text-sm">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={save}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
