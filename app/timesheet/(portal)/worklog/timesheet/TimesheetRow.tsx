"use client";

import { toast } from "sonner";
import { Clock, Lock, LockOpen, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatYmd, isWeekend } from "@/lib/timesheet/dates";
import { STICKY, fmtMinutes, gridColumns, type GridRow } from "./gridModel";
import { HourCell } from "./HourCell";

/** "[Tue 17 Nov]" for screen readers and tooltips. */
export const dayName = (ymd: string) => formatYmd(ymd, { weekday: "short", day: "numeric", month: "short" });

const STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;

// One project: its name and latest note, a notes button, one hour box per day, the row total and a lock.
export function TimesheetRow({
  row,
  days,
  minutesFor,
  busyKeys,
  onCommit,
}: {
  row: GridRow;
  days: string[];
  /** The minutes to show for a day, including a save that is still in flight. */
  minutesFor: (date: string) => number;
  busyKeys: ReadonlySet<string>;
  onCommit: (date: string, minutes: number) => void;
}) {
  const total = days.reduce((sum, d) => sum + minutesFor(d), 0);
  const notes = [...row.entries].sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const latest = notes.find((e) => e.text.trim());
  const name = row.project || "No project";

  return (
    <div
      role="row"
      className="grid items-center border-l-4 border-orange-600 bg-muted"
      style={{ gridTemplateColumns: gridColumns(days.length) }}
    >
      <div role="rowheader" className={`${STICKY} min-w-0 bg-muted px-4 py-3`}>
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{latest ? latest.text : "No notes yet"}</p>
      </div>

      <div role="cell" className="flex justify-center">
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
              <ul className="max-h-72 divide-y overflow-y-auto">
                {notes.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-sm">
                    <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                      <span>{dayName(e.date)}</span>
                      <span>
                        {fmtMinutes(Math.round((e.hours ?? 0) * 60))} · {STATUS[e.status]}
                      </span>
                    </p>
                    <p className="break-words">{e.text || "No description"}</p>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {row.cells.map((cell) => {
        const key = `${row.project}|${cell.date}`;
        return (
          <div role="cell" key={cell.date} className="px-0.5">
            <HourCell
              minutes={minutesFor(cell.date)}
              state={cell.state}
              reason={cell.reason}
              weekend={isWeekend(cell.date)}
              busy={busyKeys.has(key)}
              label={`${name}, ${dayName(cell.date)}, hours`}
              onCommit={(m) => onCommit(cell.date, m)}
            />
          </div>
        );
      })}

      <div role="cell" className="px-2 text-right font-bold tabular-nums">
        <span className="sr-only">Total: </span>
        {fmtMinutes(total)}
      </div>

      <div role="cell" className="flex justify-center pr-2">
        <Button
          variant="outline"
          size="icon-sm"
          className="max-md:size-11"
          aria-label={row.locked ? "Locked" : "Open for changes"}
          title={row.locked ? "Locked: approved, or the week has locked (timesheets lock every Sunday night)" : "Open: you can still change these hours"}
          onClick={() =>
            toast.info(row.locked ? "These hours are locked: they are approved, or the week locked on Sunday night." : "These hours can still be changed.")
          }
        >
          {row.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" className="text-muted-foreground" />}
        </Button>
      </div>
    </div>
  );
}

/** A day's header: a clock when hours are logged, the day name, the date. Today is bold with an orange bar. */
export function DayHeader({ date, today, minutes }: { date: string; today: string; minutes: number }) {
  const isToday = date === today;
  return (
    <div
      role="columnheader"
      aria-current={isToday ? "date" : undefined}
      className={`px-0.5 text-right text-sm ${isToday ? "font-bold text-foreground" : "text-muted-foreground"}`}
    >
      <div className={`pr-2 pb-1 ${isToday ? "border-b-2 border-orange-600" : ""}`}>
        <span className="flex items-center justify-end gap-1">
          {minutes > 0 && <Clock className="size-3" aria-label="Hours logged" />}
          {formatYmd(date, { weekday: "short" })}
        </span>
        <span className="block text-xs">{formatYmd(date, { day: "2-digit", month: "short" })}</span>
      </div>
    </div>
  );
}
