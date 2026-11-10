"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { addDays, formatYmd, isWeekend, mondayOf, monthGrid } from "@/lib/timesheet/dates";
import type { EventItem } from "@/lib/timesheet/eventTypes";
import { cn } from "@/lib/utils";
import { COLOR_CLASS, clock, hourLabel, onDay, segment } from "./eventStyles";
import { eventsHref, type EventsQuery } from "./eventsQuery";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROW = 48; // pixels per hour in the week and day views

type Common = {
  q: EventsQuery;
  today: string;
  items: EventItem[];
  onOpen: (e: EventItem) => void;
  onCreate: (date: string, startTime?: string) => void;
};

function Chip({ e, onOpen, compact = true }: { e: EventItem; onOpen: (e: EventItem) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      title={`${e.title}${e.startTime ? `, ${clock(e.startTime)} to ${clock(e.endTime)}` : ", all day"}`}
      className={cn(
        "block w-full truncate rounded border px-1.5 text-left text-xs leading-5 transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        COLOR_CLASS[e.color],
        compact ? "" : "py-0.5"
      )}
    >
      {e.startTime && <span className="mr-1 font-medium tabular-nums">{clock(e.startTime).replace(" ", "").toLowerCase()}</span>}
      {e.title}
    </button>
  );
}

// ---------------------------- Month ----------------------------

export function MonthView({ q, today, items, onOpen, onCreate }: Common) {
  const grid = monthGrid(Number(q.on.slice(0, 4)), Number(q.on.slice(5, 7)));
  const byDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of items) {
      for (const d of grid.days) {
        if (!onDay(e, d)) continue;
        const list = map.get(d);
        if (list) list.push(e);
        else map.set(d, [e]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [items, grid.days]);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.days.map((d) => {
          const list = byDay.get(d) ?? [];
          const other = d.slice(0, 7) !== q.on.slice(0, 7);
          return (
            <div
              key={d}
              onClick={() => onCreate(d)}
              className={cn(
                "min-h-24 min-w-0 cursor-pointer space-y-0.5 border-b border-r p-1 transition-colors hover:bg-accent/40 sm:min-h-28 [&:nth-child(7n)]:border-r-0",
                (other || isWeekend(d)) && "bg-muted/30"
              )}
            >
              <Link
                href={eventsHref("day", d, today)}
                onClick={(ev) => ev.stopPropagation()}
                aria-label={formatYmd(d, { weekday: "long", day: "numeric", month: "long" })}
                aria-current={d === today ? "date" : undefined}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors hover:bg-accent",
                  other && "text-muted-foreground",
                  d === today && "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {Number(d.slice(8))}
              </Link>
              {list.slice(0, 3).map((e) => (
                <Chip key={`${e.id}-${d}`} e={e} onOpen={onOpen} />
              ))}
              {list.length > 3 && (
                <Link
                  href={eventsHref("day", d, today)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="block px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {list.length - 3} more
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------- Week and day ----------------------------

type Placed = { e: EventItem; from: number; to: number; lane: number; lanes: number };

/** Side-by-side lanes for events that overlap in time, so none is hidden behind another. */
function place(day: string, items: EventItem[]): Placed[] {
  const segs = items
    .map((e) => ({ e, s: segment(e, day) }))
    .filter((x): x is { e: EventItem; s: { from: number; to: number } } => x.s !== null)
    .map(({ e, s }) => ({ e, from: s.from, to: Math.max(s.to, s.from + 20) }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    for (const p of cluster) out.push({ ...p, lanes });
    cluster = [];
  };
  for (const s of segs) {
    if (cluster.length && s.from >= clusterEnd) close();
    const taken = new Set(cluster.filter((p) => p.to > s.from).map((p) => p.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, s.to);
  }
  if (cluster.length) close();
  return out;
}

export function TimeGrid({ q, today, items, onOpen, onCreate }: Common) {
  const days = q.view === "day" ? [q.on] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(q.on), i));
  const scroller = useRef<HTMLDivElement>(null);

  // Open on the working day (7 AM) instead of midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * ROW;
  }, [q.view]);

  const allDay = days.map((d) => items.filter((e) => e.allDay && onDay(e, d)));
  const hasAllDay = allDay.some((l) => l.length > 0);
  const cols = `3.5rem repeat(${days.length}, minmax(${q.view === "day" ? "0" : "7rem"}, 1fr))`;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <div className="min-w-fit">
          {/* Day headings */}
          <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => (
              <Link
                key={d}
                href={eventsHref("day", d, today)}
                aria-current={d === today ? "date" : undefined}
                className="flex flex-col items-center py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>{formatYmd(d, { weekday: "short" })}</span>
                <span
                  className={cn(
                    "mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-medium tabular-nums text-foreground",
                    d === today && "bg-primary text-primary-foreground"
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </Link>
            ))}
          </div>

          {/* All-day and multi-day items */}
          {hasAllDay && (
            <div className="grid border-b" style={{ gridTemplateColumns: cols }}>
              <div className="px-1 py-1.5 text-right text-[11px] text-muted-foreground">All day</div>
              {days.map((d, i) => (
                <div key={d} className="min-w-0 space-y-0.5 border-l p-1">
                  {allDay[i].map((e) => (
                    <Chip key={e.id} e={e} onOpen={onOpen} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* The hours */}
          <div ref={scroller} className="max-h-[60vh] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: cols }}>
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="relative pr-2 text-right text-[11px] text-muted-foreground" style={{ height: ROW }}>
                    {h > 0 && <span className="absolute -top-2 right-2 bg-background px-0.5">{hourLabel(h)}</span>}
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className={cn("relative min-w-0 cursor-pointer border-l", isWeekend(d) && "bg-muted/30")}
                  style={{
                    height: ROW * 24,
                    backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                    backgroundSize: `100% ${ROW}px`,
                  }}
                  onClick={(ev) => {
                    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                    const hour = Math.min(23, Math.max(0, Math.floor(y / ROW)));
                    onCreate(d, `${String(hour).padStart(2, "0")}:00`);
                  }}
                >
                  {d === today && <NowLine />}
                  {place(d, items).map((p) => (
                    <button
                      key={`${p.e.id}-${d}`}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen(p.e);
                      }}
                      title={`${p.e.title}, ${clock(p.e.startTime)} to ${clock(p.e.endTime)}`}
                      className={cn(
                        "absolute overflow-hidden rounded border px-1.5 py-0.5 text-left text-xs leading-tight transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        COLOR_CLASS[p.e.color]
                      )}
                      style={{
                        top: (p.from / 60) * ROW,
                        height: Math.max(((p.to - p.from) / 60) * ROW - 2, 18),
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                      }}
                    >
                      <span className="block truncate font-medium">{p.e.title}</span>
                      {p.to - p.from >= 40 && (
                        <span className="block truncate tabular-nums opacity-90">
                          {clock(p.e.startTime)} – {clock(p.e.endTime)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A thin line at the current time (office time zone is not needed for a visual cue; the browser's clock is close enough). */
function NowLine() {
  const now = new Date();
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * ROW;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 h-px bg-foreground" style={{ top }} />;
}

