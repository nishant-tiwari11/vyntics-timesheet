"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addDays, formatYmd, isWeekend, mondayOf, workingDaysLabel } from "@/lib/timesheet/dates";
import { PROJECTS } from "@/lib/timesheet/projects";
import { updateLogAction } from "./actions";
import {
  CAL_VIEWS,
  calHref,
  calRange,
  calShift,
  calTitle,
  monthGridStart,
  type CalEvent,
  type CalOff,
  type CalQuery,
} from "./calendarQuery";
import { LazyDecideLogButtons, LazyDeleteLogButton, LazyWorkLogForm } from "./LazyForms";
import { FormField, Input, Select } from "../../_components/Fields";
import { LOCKED_MESSAGE, isLocked } from "@/lib/timesheet/rules";
import { holidayTypeLabel, type Holiday } from "@/lib/timesheet/holidayTypes";
import { Modal } from "./LogDialog";
import type { LogQuery } from "./logQuery";

const STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;
const OFF_LABEL = { leave: "Leave", wfh: "Work from home" } as const;
const offLabel = (o: { type: "leave" | "wfh"; compOff: boolean }) => (o.compOff ? "Comp-off" : OFF_LABEL[o.type]);
const WEEKDAYS =["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const firstName = (name: string) => name.split(/[ @]/)[0] || name;

/** "14:30" → "2:30 PM" */
function clock(time: string): string {
  if (!time) return "—";
  const h = Number(time.slice(0, 2));
  return `${h % 12 || 12}:${time.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

export default function LogCalendar({
  events,
  off,
  holidays,
  cal,
  log,
  today,
  myId,
  isAdmin,
}: {
  events: CalEvent[];
  off: CalOff[];
  holidays: Holiday[];
  cal: CalQuery;
  log: LogQuery;
  today: string;
  myId: string;
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [openOffId, setOpenOffId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<CalEvent | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const projects = useMemo(() => [...new Set<string>([...PROJECTS, ...events.map((e) => e.project).filter(Boolean)])], [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        (project === "all" || e.project === project) &&
        (status === "all" || e.status === status) &&
        (!q || e.text.toLowerCase().includes(q) || e.project.toLowerCase().includes(q) || e.who.toLowerCase().includes(q))
    );
  }, [events, search, project, status]);

  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [filtered]);

  // Approved leave and work from home, one entry per day it covers. They only match the search and the
  // "approved" status; a project filter hides them because they have no project.
  const offByDate = useMemo(() => {
    const map = new Map<string, CalOff[]>();
    if (project !== "all" || (status !== "all" && status !== "approved")) return map;
    const q = search.trim().toLowerCase();
    const range = calRange(cal);
    for (const o of off) {
      if (q && !o.who.toLowerCase().includes(q) && !o.note.toLowerCase().includes(q) && !offLabel(o).toLowerCase().includes(q)) continue;
      const last = o.to < range.to ? o.to : range.to;
      for (let d = o.from > range.from ? o.from : range.from; d <= last; d = addDays(d, 1)) {
        const list = map.get(d);
        if (list) list.push(o);
        else map.set(d, [o]);
      }
    }
    return map;
  }, [off, cal, search, project, status]);

  // Hours shown in the week and day views: 7 AM to 7 PM, stretched to include any earlier or later entry.
  const hours = useMemo(() => {
    let lo = 7;
    let hi = 19;
    for (const e of filtered) {
      const h = Number(e.start.slice(0, 2));
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [filtered]);

  const openEvent = openId ? (events.find((e) => e.id === openId) ?? null) : null;
  const hasFilters = search !== "" || project !== "all" || status !== "all";
  const href = (change: Partial<CalQuery>) => calHref(log, cal, today, change);

  // ---------------------------- Moving an entry by dragging ----------------------------

  function move(ev: CalEvent, date: string, hour?: number) {
    setMoveError(null);
    if (date > today) return setMoveError("You can't move a log to a future date.");
    if (isLocked(date, today) || isLocked(ev.date, today)) return setMoveError(LOCKED_MESSAGE);

    let start = ev.start;
    let end = ev.end;
    if (hour !== undefined) {
      // Keep the length and the minutes; only the hour changes.
      const length = mins(ev.end) - mins(ev.start);
      const s = hour * 60 + (mins(ev.start) % 60);
      if (s + length > 24 * 60 - 1) return setMoveError("That would run past midnight.");
      start = hhmm(s);
      end = hhmm(s + length);
    }
    if (date === ev.date && start === ev.start) return;

    startTransition(async () => {
      const result = await updateLogAction(ev.id, { date, text: ev.text, start, end, project: ev.project });
      if (!result.ok) setMoveError(result.error);
    });
  }

  function dropProps(date: string, hour?: number) {
    const key = `${date}|${hour ?? ""}`;
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragged || date > today || isLocked(date, today)) return; // not allowed: no drop cursor
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (over !== key) setOver(key);
      },
      onDragLeave: () => {
        if (over === key) setOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(null);
        if (dragged) move(dragged, date, hour);
        setDragged(null);
      },
      "data-over": over === key ? "true" : undefined,
    };
  }

  // ---------------------------- One entry ----------------------------

  function chip(ev: CalEvent, detailed = false) {
    const mine = ev.userId === myId;
    const canDrag = mine && ev.status === "pending" && !pending && !isLocked(ev.date, today);
    const who = isAdmin && !mine ? firstName(ev.who) : "";
    return (
      <button
        key={ev.id}
        type="button"
        className={`ts-lc-ev ts-lc-ev-${ev.status}${dragged?.id === ev.id ? " is-dragging" : ""}${detailed ? " is-detailed" : ""}`}
        draggable={canDrag}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", ev.id); // Firefox needs data to start a drag
          setDragged(ev);
          setMoveError(null);
        }}
        onDragEnd={() => {
          setDragged(null);
          setOver(null);
        }}
        onClick={() => setOpenId(ev.id)}
        title={`${ev.who}: ${ev.project || "No project"}, ${clock(ev.start)} to ${clock(ev.end)}, ${STATUS[ev.status]}`}
      >
        <span className="ts-lc-ev-time">
          {clock(ev.start)}
          {detailed && ` – ${clock(ev.end)}`}
        </span>{" "}
        <span className="ts-lc-ev-text">{who ? `${who} · ${ev.project}` : ev.project || "Time log"}</span>
        {detailed && <span className="ts-lc-ev-note">{ev.text}</span>}
      </button>
    );
  }

  // Clicking an empty part of a day (not a log, link or button inside it) opens the add form for that date.
  function addProps(d: string) {
    if (d > today || isLocked(d, today)) return {};
    return {
      onClick: (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        setAddDate(d);
      },
      title: "Click to add a time log",
    };
  }

  function offChip(o: CalOff, d: string) {
    const mine = o.userId === myId;
    const label = isAdmin && !mine ? `${firstName(o.who)} · ${offLabel(o)}` : offLabel(o);
    return (
      <button
        key={`${o.id}-${d}`}
        type="button"
        onClick={() => setOpenOffId(o.id)}
        className={`ts-lc-off ts-lc-off-${o.type}${o.compOff ? " ts-lc-comp" : ""}`}
        title={`${o.who}: ${offLabel(o)}, ${formatYmd(o.from, { day: "numeric", month: "short" })} to ${formatYmd(o.to, { day: "numeric", month: "short" })}${o.note ? `. ${o.note}` : ""}`}
      >
        {label}
      </button>
    );
  }

  // ---------------------------- Views ----------------------------

  function monthView() {
    const start = monthGridStart(cal.on);
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
      <div className="ts-lc-month">
        {WEEKDAYS.map((d) => (
          <div key={d} className="ts-lc-wd">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          const offToday = offByDate.get(d) ?? [];
          const classes = [
            "ts-lc-cell",
            offToday.length > 0 ? `has-off ts-lc-off-${offToday[0].type}` : "",
            d.slice(0, 7) !== cal.on.slice(0, 7) ? "is-out" : "",
            d === today ? "is-today" : "",
            d > today ? "is-future" : "",
            isWeekend(d) ? "is-weekend" : "",
          ].join(" ");
          return (
            <div key={d} className={classes} {...dropProps(d)} {...addProps(d)}>
              <Link href={href({ view: "day", on: d })} className="ts-lc-day" aria-label={formatYmd(d, { day: "numeric", month: "long" })}>
                {Number(d.slice(8))}
              </Link>
              {isWeekend(d) && !offToday.length && <span className="ts-lc-offday">Weekly off</span>}
              {holidayByDate.has(d) && (
                <span
                  className={`ts-hol ts-hol-${holidayByDate.get(d)!.type}`}
                  title={`${holidayByDate.get(d)!.name} (${holidayTypeLabel(holidayByDate.get(d)!.type)})${holidayByDate.get(d)!.description ? `. ${holidayByDate.get(d)!.description}` : ""}`}
                >
                  {holidayByDate.get(d)!.name}
                </span>
              )}
              {offToday.map((o) => offChip(o, d))}
              {list.slice(0, 3).map((ev) => chip(ev))}
              {list.length > 3 && (
                <Link href={href({ view: "day", on: d })} className="ts-lc-more">
                  +{list.length - 3} more
                </Link>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function weekView() {
    const monday = mondayOf(cal.on);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return (
      <div className="ts-lc-scroll">
        <div className="ts-lc-week">
          <div className="ts-lc-corner" />
          {days.map((d) => (
            <div key={d} className={`ts-lc-colhead${d === today ? " is-today" : ""}${isWeekend(d) ? " is-weekend" : ""}`}>
              {formatYmd(d, { weekday: "short" })}
              <span>{formatYmd(d, { day: "numeric", month: "short" })}</span>
            </div>
          ))}
          {off.length > 0 && (
            <div className="ts-lc-row">
              <div className="ts-lc-hour">All day</div>
              {days.map((d) => (
                <div key={d} className={`ts-lc-slot ts-lc-allday${isWeekend(d) ? " is-weekend" : ""}`}>
                  {(offByDate.get(d) ?? []).map((o) => offChip(o, d))}
                </div>
              ))}
            </div>
          )}
          {hours.map((h) => (
            <div key={h} className="ts-lc-row">
              <div className="ts-lc-hour">{clock(`${String(h).padStart(2, "0")}:00`)}</div>
              {days.map((d) => (
                <div key={d} className={`ts-lc-slot${d > today ? " is-future" : ""}${isWeekend(d) ? " is-weekend" : ""}`} {...dropProps(d, h)} {...addProps(d)}>
                  {(byDate.get(d) ?? []).filter((e) => Number(e.start.slice(0, 2)) === h).map((ev) => chip(ev))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function dayView() {
    const list = byDate.get(cal.on) ?? [];
    return (
      <div className="ts-lc-day-view">
        {cal.on <= today && (
          <div className="ts-lc-dayadd">
            <button type="button" className="ts-btn ts-btn-sm" onClick={() => setAddDate(cal.on)}>
              <span aria-hidden="true">+</span> Add time log for this day
            </button>
          </div>
        )}
        {(offByDate.get(cal.on) ?? []).length > 0 && (
          <div className="ts-lc-dayrow">
            <div className="ts-lc-hour">All day</div>
            <div className="ts-lc-slot ts-lc-allday">{(offByDate.get(cal.on) ?? []).map((o) => offChip(o, cal.on))}</div>
          </div>
        )}
        {hours.map((h) => (
          <div key={h} className="ts-lc-dayrow">
            <div className="ts-lc-hour">{clock(`${String(h).padStart(2, "0")}:00`)}</div>
            <div className={`ts-lc-slot${cal.on > today ? " is-future" : ""}${isWeekend(cal.on) ? " is-weekend" : ""}`} {...dropProps(cal.on, h)} {...addProps(cal.on)}>
              {list.filter((e) => Number(e.start.slice(0, 2)) === h).map((ev) => chip(ev, true))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function listView() {
    const dates = [...new Set([...byDate.keys(), ...offByDate.keys()])].sort();
    if (dates.length === 0) return null;
    return (
      <div className="ts-lc-list">
        {dates.map((d) => (
          <section key={d} className="ts-lc-group">
            <h3 className="ts-lc-group-title">
              {d === today ? "Today · " : ""}
              {formatYmd(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <ul>
              {(offByDate.get(d) ?? []).map((o) => (
                <li key={`${o.id}-${d}`} className={`ts-lc-listoff ts-lc-off-${o.type}`}>
                  <strong>{isAdmin ? `${o.who} · ` : ""}{offLabel(o)}</strong>
                  <span>
                    {formatYmd(o.from, { day: "numeric", month: "short" })} – {formatYmd(o.to, { day: "numeric", month: "short" })}
                    {o.note ? ` · ${o.note}` : ""}
                  </span>
                </li>
              ))}
              {(byDate.get(d) ?? []).map((ev) => (
                <li key={ev.id}>
                  <button type="button" className="ts-lc-listrow" onClick={() => setOpenId(ev.id)}>
                    <span className="ts-lc-listtime">
                      {clock(ev.start)} – {clock(ev.end)}
                    </span>
                    <span className="ts-lc-listmain">
                      <strong>{isAdmin ? `${ev.who} · ` : ""}{ev.project || "Time log"}</strong>
                      <span className="ts-muted">{ev.text}</span>
                    </span>
                    <span className={`ts-pill ts-pill-${ev.status}`}>{STATUS[ev.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  // ---------------------------- Page ----------------------------

  const openOff = openOffId ? (off.find((o) => o.id === openOffId) ?? null) : null;
  const mine = openEvent?.userId === myId;
  // Employees: their own pending entries within 7 days. Admins: any entry, any date.
  const editable = !!openEvent && (isAdmin || (mine && openEvent.status === "pending" && !isLocked(openEvent.date, today)));
  const lockedByAge = !!openEvent && !isAdmin && mine && openEvent.status === "pending" && isLocked(openEvent.date, today);

  return (
    <div className={`ts-card ts-lc${pending ? " is-busy" : ""}`} aria-busy={pending}>
      <header className="ts-lc-head">
        <div className="ts-lc-title">
          <h2 className="ts-h2s" id="cal-title">
            {calTitle(cal)}
          </h2>
          <div className="ts-lc-nav">
            <Link href={href({ on: calShift(cal, -1) })} className="ts-btn ts-btn-ghost ts-btn-sm" aria-label="Previous">
              ‹
            </Link>
            <Link href={href({ on: today })} className="ts-btn ts-btn-ghost ts-btn-sm">
              Today
            </Link>
            <Link href={href({ on: calShift(cal, 1) })} className="ts-btn ts-btn-ghost ts-btn-sm" aria-label="Next">
              ›
            </Link>
          </div>
        </div>
        <nav className="ts-lc-views" aria-label="Calendar view">
          {CAL_VIEWS.map((v) => (
            <Link key={v.id} href={href({ view: v.id })} className="ts-lc-view" aria-current={cal.view === v.id ? "page" : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="ts-lc-filters">
        <FormField label="Search the calendar" srOnlyLabel className="ts-lc-search">
          <Input
            type="search"
            size="sm"
            placeholder="Search notes, project or person"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FormField>
        <FormField label="Filter by project" srOnlyLabel>
          <Select size="sm" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Filter by status" srOnlyLabel>
          <Select size="sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </FormField>
        {hasFilters && (
          <button
            type="button"
            className="ts-btn ts-btn-ghost ts-btn-sm"
            onClick={() => {
              setSearch("");
              setProject("all");
              setStatus("all");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div aria-live="polite">
        {moveError && (
          <p className="ts-alert" role="alert">
            {moveError}
          </p>
        )}
      </div>

      {cal.view === "month" && monthView()}
      {cal.view === "week" && weekView()}
      {cal.view === "day" && dayView()}
      {cal.view === "list" && listView()}

      {filtered.length === 0 && offByDate.size === 0 && (
        <p className="ts-muted ts-lc-empty">
          {hasFilters ? "Nothing matches these filters." : "No time logs, leave or work from home in this period."}
        </p>
      )}

      <footer className="ts-lc-legend">
        <span className="ts-lc-key ts-lc-key-pending">Pending</span>
        <span className="ts-lc-key ts-lc-key-approved">Approved</span>
        <span className="ts-lc-key ts-lc-key-rejected">Rejected</span>
        <span className="ts-hol ts-hol-public">Public holiday</span>
        <span className="ts-hol ts-hol-optional">Optional holiday</span>
        <span className="ts-lc-key ts-lc-key-leave">Leave</span>
        <span className="ts-lc-key ts-lc-key-wfh">Work from home</span>
        <span className="ts-lc-key ts-lc-key-weekend ts-muted">Sat &amp; Sun off (logging optional)</span>
        <span className="ts-muted">Drag your own pending logs to another day to move them.</span>
      </footer>

      {addDate && (
        <Modal key={`add-${addDate}`} title="Add time log" onClose={() => setAddDate(null)}>
          <LazyWorkLogForm today={today} defaultDate={addDate} onSaved={() => setAddDate(null)} />
        </Modal>
      )}

      {openOff && (
        <Modal key={openOff.id} title={offLabel(openOff)} onClose={() => setOpenOffId(null)}>
          <dl className="ts-lc-detail">
            {isAdmin && (
              <>
                <dt>Employee</dt>
                <dd>{openOff.who}</dd>
              </>
            )}
            <dt>Type</dt>
            <dd>{offLabel(openOff)}</dd>
            <dt>Dates</dt>
            <dd>
              {formatYmd(openOff.from, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
              {openOff.to !== openOff.from &&
                ` – ${formatYmd(openOff.to, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}`}
              <span className="ts-muted"> · {workingDaysLabel(openOff.from, openOff.to)}</span>
            </dd>
            <dt>Status</dt>
            <dd>
              <span className="ts-pill ts-pill-approved">Approved</span>
            </dd>
            <dt>Reason</dt>
            <dd className="ts-lc-notes">{openOff.note || "—"}</dd>
          </dl>
        </Modal>
      )}

      {openEvent && (
        <Modal key={openEvent.id} title={editable ? "Edit time log" : "Time log"} onClose={() => setOpenId(null)}>
          {editable ? (
            <>
              <LazyWorkLogForm
                today={today}
                initial={{
                  id: openEvent.id,
                  date: openEvent.date,
                  start: openEvent.start,
                  end: openEvent.end,
                  project: openEvent.project,
                  text: openEvent.text,
                  noCompOff: openEvent.noCompOff,
                }}
                admin={isAdmin ? {} : undefined}
                onSaved={() => setOpenId(null)}
              />
              <div className="ts-lc-delete">
                <LazyDeleteLogButton id={openEvent.id} admin={isAdmin} />
              </div>
            </>
          ) : (
            <>
              <dl className="ts-lc-detail">
                {isAdmin && (
                  <>
                    <dt>Employee</dt>
                    <dd>{openEvent.who}</dd>
                  </>
                )}
                <dt>Date</dt>
                <dd>{formatYmd(openEvent.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
                <dt>Time</dt>
                <dd>
                  {clock(openEvent.start)} – {clock(openEvent.end)}
                  {openEvent.hours != null && ` (${openEvent.hours} h)`}
                </dd>
                <dt>Project</dt>
                <dd>{openEvent.project || "—"}</dd>
                <dt>Status</dt>
                <dd>
                  <span className={`ts-pill ts-pill-${openEvent.status}`}>{STATUS[openEvent.status]}</span>
                </dd>
                <dt>Notes</dt>
                <dd className="ts-lc-notes">{openEvent.text}</dd>
              </dl>
              {lockedByAge && <p className="ts-muted">{LOCKED_MESSAGE}</p>}
              {isAdmin && !mine && openEvent.status === "pending" && <LazyDecideLogButtons id={openEvent.id} who={openEvent.who} />}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
