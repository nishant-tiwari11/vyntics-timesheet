"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLogAction } from "../../dashboard/actions";
import { dayLogsAction } from "../actions";
import { formatYmd } from "@/lib/timesheet/dates";
import { parseDuration, planAddEntry } from "./gridModel";

const NOTE_MAX = 500;

const selectClass =
  "h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20 max-md:h-11";

// Add to your work log without opening a window: pick the project, type the hours and what you worked on, press Add.
// It is for today unless you change the day. The sentence box above is a shortcut that fills the project, day and hours for you ("2 hours Client work
// Monday"). It saves through the same add action as the Add time log window, so every check (no future days, the Sunday
// lock, the 500 character limit) is the same.
export function QuickAddBar({ today, projects }: { today: string; projects: string[] }) {
  const [project, setProject] = useState(projects[0] ?? "");
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [changingDay, setChangingDay] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const minutes = parseDuration(hours);
    if (!project) return void toast.error("Choose a project.");
    if (!date) return void toast.error("Choose a day.");
    if (minutes === null || minutes <= 0) return void toast.error("Enter the time like 2:30 or 2.5.");
    if (!text.trim()) return void toast.error("Write what you worked on.");

    setBusy(true);
    try {
      // Put it right after anything already logged that day.
      const day = await dayLogsAction(date);
      const input = planAddEntry(date, minutes, project, text, day.ok ? day.entries : []);
      if (!input) {
        toast.error("Enter the hours and what you worked on.");
        return;
      }
      const res = await addLogAction(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Added to your work log.");
      setHours("");
      setText("");
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ts-card grid gap-4" aria-labelledby="quick-add-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="quick-add-title" className="ts-h2">
          Add to your work log
        </h2>
      </div>

      <form onSubmit={add} className="grid gap-2" aria-label="Add a work log entry">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem] lg:grid-cols-[minmax(0,1fr)_6rem_minmax(0,2.4fr)_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            Project
            <select value={project} onChange={(e) => setProject(e.target.value)} disabled={busy || projects.length === 0} className={selectClass}>
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Hours
            <Input value={hours} inputMode="decimal" placeholder="2:30" maxLength={6} disabled={busy} onChange={(e) => setHours(e.target.value)} className="text-right tabular-nums max-md:h-11" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2 lg:col-span-1">
            What did you work on?
            <Input value={text} maxLength={NOTE_MAX} disabled={busy} placeholder="For example: fixed the login bug" onChange={(e) => setText(e.target.value)} className="max-md:h-11" />
          </label>
          <Button type="submit" disabled={busy} className="sm:col-span-2 lg:col-span-1 max-md:min-h-11">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Add
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {changingDay ? (
            <label className="flex items-center gap-2">
              Day
              <Input type="date" value={date} max={today} disabled={busy} onChange={(e) => setDate(e.target.value || today)} className="h-8 w-40 text-sm max-md:h-11" />
            </label>
          ) : (
            <span>
              For <strong className="font-semibold text-foreground">{date === today ? "today" : formatYmd(date, { weekday: "short", day: "numeric", month: "short" })}</strong>
            </span>
          )}
          <button type="button" className="underline underline-offset-2 hover:text-foreground max-md:min-h-11" onClick={() => setChangingDay((v) => !v)}>
            {changingDay ? "Done" : "Change day"}
          </button>
          <span aria-hidden="true">·</span>
          <span>Each entry is sent for approval as soon as you add it.</span>
        </div>
      </form>
    </section>
  );
}
