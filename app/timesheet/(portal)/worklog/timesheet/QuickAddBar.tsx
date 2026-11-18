"use client";

import { useState } from "react";
import { ArrowRight, Minimize2, Sparkles } from "lucide-react";
import { DEFAULT_START, MAX_CELL_MINUTES, toClock, toMinutes } from "./gridModel";
import { parseQuickAdd } from "./quickAdd";
import { useTrackTime } from "./TrackTime";

// "What would you like to add to your timesheet?" Type a sentence and the Track time window opens with the
// day, the length of time and the project filled in. Nothing is saved until you press Save there.
export function QuickAddBar({ today, projects }: { today: string; projects: string[] }) {
  const open = useTrackTime();
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = parseQuickAdd(text, today, projects);
    const date = found.date ?? today;
    if (found.minutes === null) {
      open({ date });
    } else {
      const start = Math.min(toMinutes(DEFAULT_START), MAX_CELL_MINUTES - found.minutes);
      open({
        date,
        prefill: { date, start: toClock(start), end: toClock(start + found.minutes), project: found.project ?? projects[0] ?? "", text: "" },
      });
    }
    setText("");
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="inline-flex min-h-9 w-fit items-center gap-2 rounded-full border bg-background px-4 text-sm text-muted-foreground hover:border-foreground max-md:min-h-11"
      >
        <Sparkles className="size-4 text-orange-600" aria-hidden="true" /> Quick add
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5" aria-label="Quick add">
      <label htmlFor="quick-add" className="text-sm text-muted-foreground">
        What would you like to add to your timesheet?
      </label>
      <div className="flex w-full max-w-[720px] items-center gap-2 rounded-full border bg-background py-1.5 pr-2 pl-4 focus-within:border-foreground">
        <Sparkles className="size-4 shrink-0 text-orange-600" aria-hidden="true" />
        <input
          id="quick-add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={120}
          autoComplete="off"
          placeholder="Try: Log 8 hours for Friday"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground max-md:min-h-9"
        />
        <button
          type="submit"
          aria-label="Add to timesheet"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white transition-colors hover:bg-orange-700 focus-visible:ring-[3px] focus-visible:ring-orange-600/30 focus-visible:outline-none max-md:size-9"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Collapse quick add"
          onClick={() => setCollapsed(true)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Minimize2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
