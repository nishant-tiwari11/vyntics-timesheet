"use client";

import { useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Entry } from "../model";
import { fmtMinutes, type GridRow } from "./gridModel";

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

// The note button on a project row: what you wrote for this project, and (while the day is still open) a box to change it.
export function RowNotes({
  row,
  name,
  notes,
  dayLabel,
  onSaveText,
}: {
  row: GridRow;
  name: string;
  notes: Entry[];
  dayLabel: (ymd: string) => string;
  onSaveText: (entry: Entry, text: string) => Promise<boolean>;
}) {
  // A day is open for changes when it is not locked, approved or in the future (a day with several entries is open too).
  const isOpen = (date: string) => {
    const state = row.cells.find((c) => c.date === date)?.state;
    return state === "editable" || state === "multi";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" className="max-md:size-11" aria-label={`Notes for ${name}`}>
          <StickyNote aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <p className="border-b px-3 py-2 text-sm font-semibold">Notes: {name}</p>
        {notes.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Nothing logged for this project in this period.</p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto">
            {notes.map((e) => (
              <NoteLine key={e.id} entry={e} label={dayLabel(e.date)} canEdit={isOpen(e.date) && e.status !== "rejected"} onSaveText={onSaveText} />
            ))}
          </ul>
        )}

      </PopoverContent>
    </Popover>
  );
}
