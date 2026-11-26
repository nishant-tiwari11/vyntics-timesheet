"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Home, Power } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { LOCATION_LABEL, durationText, type DutyLocation } from "@/lib/timesheet/dutyTypes";
import { refreshShell, useShellData } from "./NavCounts";
import { startDutyAction, stopDutyAction } from "./dutyActions";
import { LazyWorkLogForm } from "../(portal)/dashboard/LazyForms";
import { Modal } from "../(portal)/dashboard/LogDialog";

// On duty / Off duty, in the top bar. Going on duty asks where you are working from (the office or home); going off duty ends the
// stretch. The start and stop times are kept, so the day's duty hours are known (the admin sees them next to the timesheet).
// "You forgot to go off duty": which forgotten day this browser has already been told about, so the reminder isn't shown again.
const ACK_KEY = "ts-duty-forgot-ack";
const readAck = () => {
  try {
    return window.localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
};

export function DutyControl() {
  const { data, update } = useShellData();
  const duty = data?.duty ?? null;
  const [open, setOpen] = useState(false);
  // The reminder for a day they forgot to go off duty: shown to that person only (it comes from their own duty record).
  const [ack, setAck] = useState<string | null>(readAck);
  const [later, setLater] = useState(false);
  const [filling, setFilling] = useState(false);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  // The clock moves while you are on duty.
  const on = !!duty?.onDuty;
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [on]);

  if (!duty) return null; // admins, viewers, or before the database step has been run

  const stretch = duty.since ? Math.max(0, Math.round((now - Date.parse(duty.since)) / 1000)) : 0;
  const today = duty.todaySeconds + (duty.onDuty ? stretch : 0);

  function start(location: DutyLocation) {
    startTransition(async () => {
      const res = await startDutyAction(location);
      if (!res.ok) return void toast.error(res.error);
      update((d) => ({ ...d, duty: d.duty ? { ...d.duty, onDuty: true, since: new Date().toISOString(), location } : d.duty }));
      toast.success(`You are on duty (${LOCATION_LABEL[location].toLowerCase()}).`);
      setOpen(false);
      refreshShell();
    });
  }

  function stop() {
    startTransition(async () => {
      const res = await stopDutyAction();
      if (!res.ok) return void toast.error(res.error);
      update((d) => ({ ...d, duty: d.duty ? { ...d.duty, onDuty: false, since: null, location: null, todaySeconds: d.duty.todaySeconds + stretch } : d.duty }));
      toast.success("You are off duty.");
      setOpen(false);
      refreshShell();
    });
  }

  const forgotten = duty.forgotten ?? null;
  const remind = !!forgotten && ack !== forgotten.id && !later && !filling;
  function acknowledge() {
    if (!forgotten) return;
    setAck(forgotten.id);
    try {
      window.localStorage.setItem(ACK_KEY, forgotten.id);
    } catch {
      // Without storage the reminder simply shows again next time.
    }
  }

  return (
    <>
      <Dialog open={remind} onOpenChange={(o) => !o && setLater(true)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>You forgot to go off duty</DialogTitle>
            <DialogDescription>
              {forgotten
                ? `On ${formatYmd(forgotten.date, { weekday: "long", day: "numeric", month: "long" })} you went on duty at ${formatTime(forgotten.start)} (${LOCATION_LABEL[forgotten.location].toLowerCase()}) and did not go off duty, so it was closed at midnight. Please add your time log for that day with the time you actually finished.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLater(true)}>
              Remind me later
            </Button>
            <Button
              type="button"
              onClick={() => {
                acknowledge();
                setFilling(true);
              }}
            >
              Add time log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {filling && forgotten && (
        <Modal title="Add time log" description={`For ${formatYmd(forgotten.date, { weekday: "long", day: "numeric", month: "long" })}. You went on duty at ${formatTime(forgotten.start)}; enter the time you finished.`} onClose={() => setFilling(false)}>
          <LazyWorkLogForm today={todayInOffice()} prefill={{ date: forgotten.date, start: formatTime(forgotten.start), end: "", project: "", text: "" }} onSaved={() => setFilling(false)} />
        </Modal>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:min-h-11"
        aria-label={duty.onDuty ? `On duty, ${durationText(today)} today. Press to go off duty.` : "Off duty. Press to go on duty."}
      >
        <span className={`size-2 rounded-full ${duty.onDuty ? "animate-pulse bg-green-600" : "bg-muted-foreground/50"}`} aria-hidden="true" />
        {duty.onDuty ? (
          <>
            <span>On duty</span>
            <span className="hidden tabular-nums text-muted-foreground sm:inline">{durationText(stretch)}</span>
          </>
        ) : (
          <span>Off duty</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          {duty.onDuty ? (
            <>
              <DialogHeader>
                <DialogTitle>You are on duty</DialogTitle>
                <DialogDescription>
                  Since {duty.since ? formatTime(duty.since) : ""} {duty.location ? `(${LOCATION_LABEL[duty.location].toLowerCase()})` : ""}. This stretch: {durationText(stretch)}. Today in all: {durationText(today)}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Stay on duty
                </Button>
                <Button type="button" onClick={stop} disabled={pending}>
                  <Power aria-hidden="true" /> {pending ? "Saving..." : "Go off duty"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Go on duty</DialogTitle>
                <DialogDescription>Where are you working from?{today > 0 ? ` You have ${durationText(today)} on duty today so far.` : ""}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["office", "wfh"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    disabled={pending}
                    onClick={() => start(l)}
                    className="flex flex-col items-center gap-2 rounded-xl border p-5 text-sm font-medium outline-none transition-colors hover:border-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                  >
                    {l === "office" ? <Building2 className="size-6" aria-hidden="true" /> : <Home className="size-6" aria-hidden="true" />}
                    {LOCATION_LABEL[l]}
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
