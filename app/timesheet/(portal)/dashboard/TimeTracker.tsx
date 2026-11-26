"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, Home, Power } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { OFFICE_TIME_ZONE, formatTime } from "@/lib/timesheet/dates";
import { LOCATION_LABEL, type DutyLocation } from "@/lib/timesheet/dutyTypes";
import { refreshShell, useShellData } from "../../_components/NavCounts";
import { startDutyAction, stopDutyAction } from "../../_components/dutyActions";
import { LazyWorkLogForm } from "./LazyForms";
import { Modal } from "./LogDialog";

const hm = (seconds: number) => {
  const m = Math.floor(Math.max(seconds, 0) / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const fmtHours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
/** The office date ("2026-11-26") of a moment. */
const officeDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const R = 62;
const C = 2 * Math.PI * R;

/**
 * The time tracker tile. The ring is the time you have been on duty today, and it moves while you are on duty. You can go on duty
 * (office or work from home) and off duty right here; it is the same thing as the button in the top bar. People who have no
 * duty button (viewers) see the hours they logged today instead.
 */
export default function TimeTracker({ today, logged, target }: { today: string; logged: number; target: number }) {
  const { data, update } = useShellData();
  const duty = data?.duty ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  // After going off duty, the time log window opens with the duty hours already filled in.
  const [fill, setFill] = useState<{ date: string; start: string; end: string } | null>(null);

  const on = !!duty?.onDuty;
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [on]);

  const stretch = duty?.since ? Math.max(0, Math.round((now - Date.parse(duty.since)) / 1000)) : 0;
  const seconds = duty ? duty.todaySeconds + (duty.onDuty ? stretch : 0) : Math.round(logged * 3600);
  const pct = Math.min(seconds / (target * 3600), 1);

  function start(location: DutyLocation) {
    startTransition(async () => {
      const res = await startDutyAction(location);
      if (!res.ok) return void toast.error(res.error);
      update((d) => ({ ...d, duty: d.duty ? { ...d.duty, onDuty: true, since: new Date().toISOString(), location } : d.duty }));
      toast.success(`You are on duty (${LOCATION_LABEL[location].toLowerCase()}).`);
      refreshShell();
    });
  }

  function stop() {
    const since = duty?.since ?? null;
    startTransition(async () => {
      const res = await stopDutyAction();
      if (!res.ok) return void toast.error(res.error);
      update((d) => ({ ...d, duty: d.duty ? { ...d.duty, onDuty: false, since: null, location: null, todaySeconds: d.duty.todaySeconds + stretch } : d.duty }));
      toast.success("You are off duty. Add what you worked on.");
      refreshShell();
      // Fill the time log with this stretch: the day it started, from the time you went on duty to now. A stretch that ran past
      // midnight is cut at the end of its first day, and one under a minute is not worth a log.
      if (since) {
        const nowIso = new Date().toISOString();
        const date = officeDate(since);
        const start = formatTime(since);
        const end = officeDate(nowIso) === date ? formatTime(nowIso) : "23:59";
        if (end > start) setFill({ date, start, end });
      }
    });
  }

  return (
    <section className="ts-tile ts-t-today" aria-labelledby="tracker-title">
      <div className="ts-tile-head">
        <h2 className="ts-tile-title" id="tracker-title">
          Time tracker
        </h2>
        <Link href={`/timesheet/worklog?view=day&date=${today}`} className="ts-tile-arrow" aria-label="Open today in your work log">
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="ts-ringbox">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r={R} className="ts-ringbox-track" />
          <circle cx="80" cy="80" r={R} className="ts-ringbox-fill" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 80 80)" />
        </svg>
        <div className="ts-ringbox-text">
          <strong>{hm(seconds)}</strong>
          <span>{duty ? "Work time" : "Logged today"}</span>
        </div>
      </div>

      {duty ? (
        <div className="ts-tracker-actions">
          {on ? (
            <button type="button" onClick={stop} disabled={pending} className="ts-tracker-stop">
              <Power className="size-4" aria-hidden="true" /> {pending ? "Saving..." : "Go off duty"}
            </button>
          ) : (
            <>
              <span className="ts-tracker-hint">Start work</span>
              {(["office", "wfh"] as const).map((l) => (
                <button key={l} type="button" onClick={() => start(l)} disabled={pending} className="ts-tracker-start">
                  {l === "office" ? <Building2 className="size-4" aria-hidden="true" /> : <Home className="size-4" aria-hidden="true" />}
                  {l === "office" ? "Office" : "Home"}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}

      {fill && (
        <Modal title="Add time log" description={`You were on duty from ${fill.start} to ${fill.end}. Add what you worked on.`} onClose={() => setFill(null)}>
          <LazyWorkLogForm today={today} prefill={{ date: fill.date, start: fill.start, end: fill.end, project: "", text: "" }} onSaved={() => setFill(null)} />
        </Modal>
      )}

      <p className="ts-ringbox-note">
        {logged >= target ? `Timesheet: ${fmtHours(logged)} logged, today's target is reached.` : `Timesheet: ${fmtHours(logged)} of ${fmtHours(target)} logged today.`}
      </p>
    </section>
  );
}
