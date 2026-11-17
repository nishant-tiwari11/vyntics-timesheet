"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { fmtMinutes, parseDuration, type CellState } from "./gridModel";

// One hour box: a project on one day. Type "5:30" or "5.5" and press Enter or leave the box to save. It looks like
// plain text until you hover or focus it; weekend and future boxes show an empty border; the focused one is thick.
export function HourCell({
  minutes,
  state,
  reason,
  weekend,
  busy,
  label,
  onCommit,
}: {
  minutes: number;
  state: CellState;
  reason: string;
  weekend: boolean;
  busy: boolean;
  /** Read by screen readers, e.g. "Client work, Tue 17 Nov, hours". */
  label: string;
  onCommit: (minutes: number) => void;
}) {
  // null = not being typed in: show the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const skip = useRef(false);

  const editable = state === "editable" && !busy;
  const shown = draft ?? (minutes > 0 ? fmtMinutes(minutes) : "");

  function finish() {
    if (skip.current) {
      skip.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const parsed = parseDuration(draft);
    setDraft(null);
    if (parsed === null) {
      toast.error("Enter the time like 7:30 or 7.5 (up to 23:59).");
      return;
    }
    if (parsed !== minutes) onCommit(parsed);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      title={reason || undefined}
      value={shown}
      placeholder={weekend || state === "future" ? "" : "0"}
      readOnly={!editable}
      disabled={state === "future"}
      aria-busy={busy || undefined}
      maxLength={6}
      onFocus={(e) => {
        if (!editable) return;
        setDraft(shown);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          skip.current = true;
          e.currentTarget.blur();
        }
      }}
      className={[
        "h-9 w-full min-w-0 rounded-md border px-2 text-right text-sm tabular-nums outline-none transition-colors",
        "placeholder:text-muted-foreground/50",
        weekend || state === "future" ? "border-input bg-background" : "border-transparent bg-transparent",
        editable ? "cursor-text hover:border-input hover:bg-background focus:border-2 focus:border-foreground focus:bg-background focus:px-[7px]" : "cursor-default",
        state === "future" ? "bg-muted/60" : "",
        busy ? "opacity-50" : "",
        "max-md:h-11",
      ].join(" ")}
    />
  );
}
