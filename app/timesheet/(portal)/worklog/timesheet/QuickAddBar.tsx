"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLogAction } from "../../dashboard/actions";
import { dayLogsAction } from "../actions";
import { fmtMinutes, parseDuration, planAddEntry } from "./gridModel";
import { parseQuickAdd } from "./quickAdd";

const NOTE_MAX = 500;

const selectClass =
  "h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20 max-md:h-11";

// Add to your work log without opening a window: pick the project and the day, type the hours and what you worked on,
// press Add. The sentence box above is a shortcut that fills the project, day and hours for you ("2 hours Client work
// Monday"). It saves through the same add action as the Track time window, so every check (no future days, the Sunday
// lock, the 500 character limit) is the same.
export function QuickAddBar({ today, projects }: { today: string; projects: string[] }) {
  const [sentence, setSentence] = useState("");
  const [project, setProject] = useState(projects[0] ?? "");
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  function fill(e: React.FormEvent) {
    e.preventDefault();
    const found = parseQuickAdd(sentence, today, projects);
    if (found.date) setDate(found.date);
    if (found.project) setProject(found.project);
    if (found.minutes !== null) setHours(fmtMinutes(found.minutes));
    if (found.date === null && found.minutes === null && found.project === null) toast.info("Try something like: 2 hours Client work Monday");
    setSentence("");
  }

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
        <form onSubmit={fill} aria-label="Quick fill" className="flex w-full max-w-sm items-center gap-2 rounded-full border bg-background py-1 pr-1 pl-3 focus-within:border-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <input
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            maxLength={120}
            autoComplete="off"
            aria-label="Quick fill: type the hours, the project and the day"
            placeholder="Quick fill: 2 hours Client work Monday"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground max-md:min-h-9"
          />
          <button type="submit" className="rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/70 max-md:min-h-9">
            Fill
          </button>
        </form>
      </div>

      <form onSubmit={add} className="grid gap-3" aria-label="Add a work log entry">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem]">
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
            Day
            <Input type="date" value={date} max={today} disabled={busy} onChange={(e) => setDate(e.target.value)} className="max-md:h-11" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Hours
            <Input value={hours} inputMode="decimal" placeholder="2:30" maxLength={6} disabled={busy} onChange={(e) => setHours(e.target.value)} className="text-right tabular-nums max-md:h-11" />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          What did you work on?
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={NOTE_MAX}
            disabled={busy}
            placeholder="For example: fixed the login bug"
            className="w-full rounded-[var(--radius)] border border-input bg-background px-3 py-2 text-sm font-normal outline-none placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Each entry is sent for approval as soon as you add it.</p>
          <Button type="submit" disabled={busy} className="max-md:min-h-11">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Add to work log
          </Button>
        </div>
      </form>
    </section>
  );
}
