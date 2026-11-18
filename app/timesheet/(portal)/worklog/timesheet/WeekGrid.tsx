"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECTS } from "@/lib/timesheet/projects";
import { addLogAction, deleteLogAction, updateLogAction, type ActionResult } from "../../dashboard/actions";
import type { Entry } from "../model";
import { STICKY, buildRows, fmtMinutes, gridColumns, planSave } from "./gridModel";
import { DayHeader, TimesheetRow } from "./TimesheetRow";

export type GridProps = {
  /** The days to show: seven (Monday to Sunday) for the Week view, one for the Day view. */
  days: string[];
  /** Every entry in those days. Only the signed-in user's own are shown. */
  entries: Entry[];
  myId: string;
  today: string;
};

// The grid itself: a header with the days, one row per project, a totals row, and the Submit button. Typing in a
// box saves through the same add / change / delete actions the Track time window uses, and the totals follow at
// once; if a save fails the box goes back to what it was and a message says why.
export default function WeekGrid({ days, entries, myId, today }: GridProps) {
  const [extra, setExtra] = useState<string[]>([]);
  // Hours typed but not yet confirmed by the server, by "project|date". Cleared when fresh data arrives.
  const [typed, setTyped] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [seen, setSeen] = useState(entries);
  if (seen !== entries) {
    setSeen(entries);
    setTyped({});
  }

  const rows = buildRows({ entries, myId, days, today, extra });
  const minutesFor = (project: string, date: string, saved: number) => typed[`${project}|${date}`] ?? saved;
  const dayTotals = days.map((d, i) => rows.reduce((sum, r) => sum + minutesFor(r.project, d, r.cells[i].minutes), 0));
  const grand = dayTotals.reduce((a, b) => a + b, 0);
  const addable = PROJECTS.filter((p) => !rows.some((r) => r.project === p));
  const wide = days.length > 1;

  async function commit(project: string, date: string, minutes: number) {
    const row = rows.find((r) => r.project === project);
    const cell = row?.cells.find((c) => c.date === date);
    if (!row || !cell) return;
    const others = entries.filter((e) => e.userId === myId && e.date === date && e.status !== "rejected" && !cell.entries.includes(e));
    const plan = planSave(cell, minutes, project, others);
    if (plan.kind === "none") return;

    const key = `${project}|${date}`;
    setTyped((t) => ({ ...t, [key]: minutes }));
    setBusy((b) => new Set(b).add(key));
    let res: ActionResult;
    try {
      res = plan.kind === "add" ? await addLogAction(plan.input) : plan.kind === "update" ? await updateLogAction(plan.id, plan.input) : await deleteLogAction(plan.id);
    } catch {
      res = { ok: false, error: "Couldn't save. Check your connection and try again." };
    }
    setBusy((b) => {
      const next = new Set(b);
      next.delete(key);
      return next;
    });
    if (!res.ok) {
      toast.error(res.error);
      setTyped((t) => {
        const rest = { ...t };
        delete rest[key];
        return rest;
      });
    }
  }

  return (
    <section aria-label={wide ? "Weekly timesheet" : "Daily timesheet"} className="grid gap-3">
      <div className="overflow-x-auto overscroll-x-contain">
        <div role="table" aria-label="Hours by project and day" className="w-max min-w-full">
          <div role="row" className="grid items-end border-l-4 border-transparent pb-0" style={{ gridTemplateColumns: gridColumns(days.length) }}>
            <div role="columnheader" className={`${STICKY} bg-background px-4 pb-2 text-sm font-medium text-muted-foreground`}>
              Project
            </div>
            <div role="columnheader" aria-hidden="true" />
            {days.map((d, i) => (
              <DayHeader key={d} date={d} today={today} minutes={dayTotals[i]} />
            ))}
            <div role="columnheader" className="px-2 pb-2 text-right text-sm text-muted-foreground">
              Total
            </div>
            <div role="columnheader" aria-hidden="true" />
          </div>

          <div role="rowgroup" className="grid gap-px border-y bg-border">
            {rows.length === 0 && (
              <p className="bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing logged {wide ? "this week" : "on this day"}. Press Track time, or add a project below and type your hours.
              </p>
            )}
            {rows.map((row) => (
              <TimesheetRow
                key={row.project}
                row={row}
                days={days}
                minutesFor={(date) => minutesFor(row.project, date, row.cells[days.indexOf(date)].minutes)}
                busyKeys={busy}
                onCommit={(date, minutes) => void commit(row.project, date, minutes)}
              />
            ))}
          </div>

          <div role="row" className="grid items-center border-l-4 border-transparent font-bold" style={{ gridTemplateColumns: gridColumns(days.length) }}>
            <div role="rowheader" className={`${STICKY} bg-background px-4 py-3`}>
              Total
            </div>
            <div role="cell" />
            {dayTotals.map((m, i) => (
              <div role="cell" key={days[i]} className="px-2.5 text-right text-sm tabular-nums">
                {m > 0 ? fmtMinutes(m) : <span className="font-normal text-muted-foreground/60">0</span>}
              </div>
            ))}
            <div role="cell" className="px-2 text-right tabular-nums">
              {fmtMinutes(grand)}
            </div>
            <div role="cell" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {addable.length > 0 ? (
          <Select value="" onValueChange={(p) => setExtra((x) => [...x, p])}>
            <SelectTrigger className="w-52 max-md:min-h-11" aria-label="Add a project row">
              <Plus className="size-4" aria-hidden="true" />
              <SelectValue placeholder="Add project row" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        <Button
          type="button"
          className="max-md:min-h-11"
          onClick={() => toast.info("Each entry is sent for approval as soon as you save it, so there is nothing more to submit.")}
        >
          <Send aria-hidden="true" /> Submit Timesheet
        </Button>
      </div>
    </section>
  );
}
