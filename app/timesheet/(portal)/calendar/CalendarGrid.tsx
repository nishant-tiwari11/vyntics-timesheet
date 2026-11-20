"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CalendarOff, Clock, Home, PartyPopper, Palmtree, PencilLine, Plus, Sparkles, CalendarDays, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { EventItem } from "@/lib/timesheet/eventTypes";
import dynamic from "next/dynamic";
import type { DialogState } from "../events/EventDialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// The month grid. The page works out what is on each day (the same data as before); this file only draws it and adds the
// ways to explore it: filters, a "+N more" list, a hover preview and a side panel with the day's details.

// The event window (a long form) is only needed when one is opened, so it loads then.
const EventDialog = dynamic(() => import("../events/EventDialog"), { ssr: false });

export type Kind = "work" | "leave" | "wfh" | "comp" | "holiday" | "off" | "google" | "event";

export type DayItem = {
  id: string;
  kind: Kind;
  label: string;
  /** A second line: how long, which type, pending, and so on. */
  detail?: string;
  /** A saved event: opens its details, where it can be changed or deleted when you are allowed to. */
  event?: EventItem;
};

export type DayView = {
  date: string;
  num: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  hours: number;
  /** 0 to 1: how close the day's hours are to the daily target. */
  fill: number;
  hasLog: boolean;
  /** "Monday 3 March" */
  longLabel: string;
  /** The whole day in words, for screen readers. */
  summary: string;
  href: string;
  items: DayItem[];
};

const KINDS: Record<Kind, { name: string; Icon: LucideIcon }> = {
  work: { name: "Work hours", Icon: Clock },
  leave: { name: "Leave", Icon: Palmtree },
  wfh: { name: "Work from home", Icon: Home },
  comp: { name: "Comp-off", Icon: Sparkles },
  holiday: { name: "Holiday", Icon: PartyPopper },
  off: { name: "Weekly off", Icon: CalendarOff },
  google: { name: "Google event", Icon: CalendarDays },
  event: { name: "Event", Icon: CalendarClock },
};

const FILTERS: { kind: Kind | "leaveAll"; name: string }[] = [
  { kind: "work", name: "Work hours" },
  { kind: "leaveAll", name: "Leave and WFH" },
  { kind: "event", name: "Events" },
  { kind: "holiday", name: "Holidays" },
  { kind: "off", name: "Weekly off" },
  { kind: "google", name: "Google" },
];

const groupOf = (k: Kind): Kind | "leaveAll" => (k === "leave" || k === "wfh" || k === "comp" ? "leaveAll" : k);

function Chip({ item, compact }: { item: DayItem; compact?: boolean }) {
  const { Icon } = KINDS[item.kind];
  return (
    <span className={`ts-ev ts-ev-${item.kind}${compact ? " is-compact" : ""}`}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="ts-ev-text">{item.label}</span>
    </span>
  );
}

function DayDetails({ day, items, onEvent }: { day: DayView; items: DayItem[]; onEvent: (e: EventItem) => void }) {
  return items.length === 0 ? (
    <p className="ts-muted">Nothing on this day.</p>
  ) : (
    <ul className="ts-cal-detail-list">
      {items.map((it) => (
        <li key={it.id} className="ts-cal-detail">
          <Chip item={it} />
          {it.detail && <span className="ts-muted">{it.detail}</span>}
          {it.event && (
            <button type="button" className="text-xs font-medium underline underline-offset-2 max-md:min-h-11" onClick={() => onEvent(it.event!)}>
              Open event
            </button>
          )}
        </li>
      ))}
      {day.hasLog && day.hours === 0 && <li className="ts-muted">A work log was added.</li>}
    </ul>
  );
}

export default function CalendarGrid({ days, weekdays, title, dailyTarget, today, isAdmin, myId }: { days: DayView[]; weekdays: string[]; title: string; dailyTarget: number; today: string; isAdmin: boolean; myId: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<DayView | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // The drawer and the pop-up list close first, then the event window opens.
  const showEvent = (event: EventItem) => {
    setOpen(null);
    setDialog({ mode: "view", event });
  };

  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const shown = useMemo(
    () =>
      days.map((d) => ({
        day: d,
        items: d.items.filter((i) => !hidden.has(groupOf(i.kind))),
        showHours: !hidden.has("work"),
        showOff: !hidden.has("off"),
      })),
    [days, hidden],
  );

  return (
    <>
      <div className="ts-cal-filters" role="group" aria-label="Show on the calendar">
        {FILTERS.map((f) => {
          const on = !hidden.has(f.kind);
          const Icon = f.kind === "leaveAll" ? Palmtree : KINDS[f.kind].Icon;
          return (
            <button key={f.kind} type="button" className={`ts-cal-filter ts-cal-filter-${f.kind}`} aria-pressed={on} onClick={() => toggle(f.kind)}>
              <Icon className="size-3.5" aria-hidden="true" />
              {f.name}
            </button>
          );
        })}
        <Button type="button" size="sm" className="ml-auto max-md:min-h-11" onClick={() => setDialog({ mode: "create", date: today })}>
          <Plus aria-hidden="true" /> Add event
        </Button>
      </div>

      <section className="ts-card ts-cal-card" aria-label={`Calendar for ${title}`}>
        <div className="ts-cal-weekdays" aria-hidden="true">
          {weekdays.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <ol className="ts-cal-grid">
          {shown.map(({ day, items, showHours, showOff }) => {
            const visible = items.slice(0, 2);
            const extra = items.length - visible.length;
            const hatched = day.isWeekend && showOff;
            return (
              <li key={day.date} className="ts-cal-cell">
                <div className={`ts-cal-day${hatched ? " is-weekend" : ""}${day.inMonth ? "" : " is-other"}${day.isToday ? " is-today" : ""}`}>
                  {showHours && <span className="ts-cal-fill" aria-hidden="true" style={{ height: `${day.fill * 100}%` }} />}
                  <button
                    type="button"
                    className="ts-cal-hit"
                    aria-label={`${day.summary}. Show details`}
                    aria-current={day.isToday ? "date" : undefined}
                    onClick={() => setOpen(day)}
                  />
                  <span className="ts-cal-top" aria-hidden="true">
                    <span className="ts-cal-num">{day.num}</span>
                    {day.hasLog && showHours && <span className="ts-cal-dot" />}
                  </span>
                  <span className="ts-cal-events" aria-hidden="true">
                    {visible.map((it) => (
                      <Chip key={it.id} item={it} compact />
                    ))}
                  </span>
                  {extra > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="ts-cal-more" aria-label={`${extra} more on ${day.longLabel}`}>
                          +{extra} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="ts-portal ts-cal-pop" align="start">
                        <p className="ts-cal-pop-title">{day.longLabel}</p>
                        <DayDetails day={day} items={items} onEvent={showEvent} />
                      </PopoverContent>
                    </Popover>
                  )}
                  <span className="ts-cal-bottom" aria-hidden="true">
                    {showHours && day.hours > 0 && <span className="ts-cal-hours">{Math.round(day.hours * 100) / 100} h</span>}
                  </span>

                  {/* A quick look when the pointer rests on a day (desktop only; the side panel has everything). */}
                  <span className="ts-cal-preview" aria-hidden="true">
                    <strong>{day.longLabel}</strong>
                    {showHours && <span>{day.hours > 0 ? `${Math.round(day.hours * 100) / 100} h of ${dailyTarget} h` : "No hours logged"}</span>}
                    {items.slice(0, 5).map((it) => (
                      <span key={it.id}>
                        {it.label}
                        {it.detail ? `: ${it.detail}` : ""}
                      </span>
                    ))}
                    {items.length > 5 && <span>+{items.length - 5} more</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <ul className="ts-legend" aria-label="Legend">
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const { Icon, name } = KINDS[k];
          return (
            <li key={k}>
              <span className={`ts-ev ts-ev-${k} is-compact`}>
                <Icon className="size-3" aria-hidden="true" />
                {name}
              </span>
            </li>
          );
        })}
        <li>
          <span className="ts-legend-swatch ts-legend-fill" aria-hidden="true" /> Fill = hours (full at {dailyTarget} h)
        </li>
        <li>
          <span className="ts-legend-swatch ts-legend-hatch" aria-hidden="true" /> Weekly off
        </li>
        <li>
          <span className="ts-legend-swatch ts-legend-today" aria-hidden="true" /> Today
        </li>
        <li>
          <PencilLine className="size-3.5" aria-hidden="true" /> Dot = work log added
        </li>
      </ul>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="ts-drawer w-[360px] max-w-[90vw] gap-0 p-0">
          <div className="ts-portal ts-cal-drawer">
            <SheetHeader className="p-0">
              <SheetTitle>{open?.longLabel}</SheetTitle>
              <SheetDescription>
                {open && open.hours > 0 ? `${Math.round(open.hours * 100) / 100} h logged of ${dailyTarget} h` : "No hours logged"}
              </SheetDescription>
            </SheetHeader>
            {open && (
              <>
                <DayDetails day={open} items={open.items} onEvent={showEvent} />
                <div className="ts-cal-drawer-actions">
                  <Link href={open.href} className="ts-btn ts-btn-sm ts-cal-drawer-link">
                    Open this day
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="max-md:min-h-11"
                    onClick={() => {
                      const date = open.date;
                      setOpen(null);
                      setDialog({ mode: "create", date });
                    }}
                  >
                    <Plus aria-hidden="true" /> Add event
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {dialog && <EventDialog state={dialog} onClose={() => setDialog(null)} isAdmin={isAdmin} myId={myId} onEdit={(e) => setDialog({ mode: "edit", event: e })} />}
    </>
  );
}
