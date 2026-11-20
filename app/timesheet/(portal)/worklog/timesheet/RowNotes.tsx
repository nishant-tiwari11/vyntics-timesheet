"use client";

import { useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Entry } from "../model";
import { fmtMinutes, parseDuration, type GridRow } from "./gridModel";

const STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;
const NOTE_MAX = 500;

const fieldClass = "w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20";

/** One entry's description, which can be changed here when the day is still open. */
function NoteLine({ entry, label, canEdit, onSaveText }: { entry: Entry; label: string; canEdit: boolean; onSaveText: (entry: Entry, text: string) => Promise<boolean> }) {
  const [text, setText] = useState(entry.text);
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== entry.text.trim();
  return (
    <li className="grid gap-1.5 px-3 py-2 text-sm">
      <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {fmtMinutes(Math.round((entry.hours ?? 0) * 60))} · {STATUS[entry.status]}
        </span>
      </p>
      {canEdit ? (
        <>
          <textarea
            aria-label={`What you worked on, ${label}`}
            value={text}
            rows={2}
            maxLength={NOTE_MAX}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            className={`${fieldClass} py-2`}
          />
          {dirty && (
            <Button
              type="button"
              size="sm"
              className="w-fit max-md:min-h-11"
              disabled={busy || !text.trim()}
              onClick={async () => {
                setBusy(true);
                await onSaveText(entry, text.trim());
                setBusy(false);
              }}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save note
            </Button>
          )}
        </>
      ) : (
        <p className="break-words">{entry.text || "No description"}</p>
      )}
    </li>
  );
}

// The note button on a project row. It lists what you wrote for this project (and lets you change it while the day is
// still open) and has a small form to add hours and a description for any open day, so the work log can be filled in
// right here, not only through the Track time window. It uses the same add and change actions as everything else.
export function RowNotes({
  row,
  name,
  notes,
  dayLabel,
  onSaveText,
  onAdd,
}: {
  row: GridRow;
  name: string;
  notes: Entry[];
  dayLabel: (ymd: string) => string;
  onSaveText: (entry: Entry, text: string) => Promise<boolean>;
  onAdd: (date: string, minutes: number, text: string) => Promise<boolean>;
}) {
  // A day is open for changes when it is not locked, approved or in the future (a day with several entries is open too).
  const isOpen = (date: string) => {
    const state = row.cells.find((c) => c.date === date)?.state;
    return state === "editable" || state === "multi";
  };
  const openDays = row.cells.filter((c) => isOpen(c.date));

  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const day = date || openDays[openDays.length - 1]?.date || "";

  async function add() {
    const minutes = parseDuration(hours);
    if (!day) return void toast.error("Choose a day.");
    if (minutes === null || minutes <= 0) return void toast.error("Enter the time like 2:30 or 2.5.");
    if (!text.trim()) return void toast.error("Write what you worked on.");
    setBusy(true);
    const ok = await onAdd(day, minutes, text.trim());
    setBusy(false);
    if (ok) {
      setHours("");
      setText("");
      toast.success("Added to your timesheet.");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Notes and add an entry for ${name}`}>
          <StickyNote aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <p className="border-b px-3 py-2 text-sm font-semibold">Work log: {name}</p>
        {notes.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Nothing logged for this project in this period.</p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto">
            {notes.map((e) => (
              <NoteLine key={e.id} entry={e} label={dayLabel(e.date)} canEdit={isOpen(e.date) && e.status !== "rejected"} onSaveText={onSaveText} />
            ))}
          </ul>
        )}

        <form
          className="grid gap-2 border-t p-3"
          aria-label={`Add an entry for ${name}`}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <p className="text-sm font-semibold">Add to the work log</p>
          {openDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No day in this view is open for new entries.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Day
                  <select value={day} onChange={(e) => setDate(e.target.value)} disabled={busy} className={`${fieldClass} h-9 max-md:h-11`}>
                    {openDays.map((c) => (
                      <option key={c.date} value={c.date}>
                        {dayLabel(c.date)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Hours
                  <input
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    inputMode="decimal"
                    placeholder="2:30"
                    maxLength={6}
                    disabled={busy}
                    className={`${fieldClass} h-9 text-right tabular-nums max-md:h-11`}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs text-muted-foreground">
                What did you work on?
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={NOTE_MAX} disabled={busy} placeholder="For example: fixed the login bug" className={`${fieldClass} py-2`} />
              </label>
              <Button type="submit" size="sm" className="w-fit max-md:min-h-11" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Add entry
              </Button>
            </>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
