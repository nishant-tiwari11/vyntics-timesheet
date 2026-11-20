import { logError } from "@/lib/timesheet/log";
import "../dashboard/dashboard.css"; // shared chips, tags, skeleton, buttons
import "./calendar.css";
import Link from "next/link";
import { addDays, daysInclusive, formatYmd, isWeekend, monthGrid, monthKey, parseMonth, todayInOffice } from "@/lib/timesheet/dates";
import { dailyTarget } from "@/lib/timesheet/settings";
import { TimesheetError } from "@/lib/timesheet/errors";
import { getMonthData, type MonthData } from "@/lib/timesheet/calendar";
import { listStoredEvents } from "@/lib/timesheet/events";
import { calendarLabel, type EventItem } from "@/lib/timesheet/eventTypes";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { clock12 } from "../worklog/model";
import { holidayTypeLabel, type Holiday } from "@/lib/timesheet/holidayTypes";
import { listHolidaysBetween } from "@/lib/timesheet/holidays";
import { googleConfig } from "@/lib/google/config";
import { accessTokenFor, isConnected } from "@/lib/google/connection";
import { listEvents, type GoogleEvent } from "@/lib/google/events";
import { requireUser } from "@/lib/timesheet/auth";
import CalendarGrid, { type DayItem, type DayView } from "./CalendarGrid";
import CalendarNav from "./CalendarNav";
import GoogleCalendarCard from "./GoogleCalendarCard";

export const metadata = { title: "Calendar" };

const BASE = "/timesheet/calendar";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

type Cover = { type: "leave" | "wfh"; pending: boolean; compOff: boolean };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; google?: string | string[]; gcal?: string | string[] }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw = first(sp.month);
  const today = todayInOffice();
  const current = { year: +today.slice(0, 4), month: +today.slice(5, 7) };
  const { year, month } = parseMonth(raw) ?? current; // invalid value → current month

  const grid = monthGrid(year, month);
  const ym = monthKey(year, month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const title = formatYmd(grid.first, { month: "long", year: "numeric" });

  // Everything the page needs is fetched at the same time, not one after another: the month's data, your Google events
  // (a call to Google's servers, the slowest part) and the holidays. Each one fails on its own, so a problem with one
  // never takes the others down.
  const configured = googleConfig() !== null;

  async function loadGoogle() {
    const result = { connected: false, showGoogle: false, googleError: null as string | null, googleByDate: new Map<string, GoogleEvent[]>() };
    if (!configured) return result;
    try {
      result.connected = await isConnected();
      result.showGoogle = result.connected && first(sp.gcal) === "1";
      if (result.showGoogle) {
        const me = await requireUser();
        const token = await accessTokenFor(me.id);
        if (!token) {
          result.connected = false; // Google access was removed; the card now offers to connect again
          result.showGoogle = false;
        } else {
          for (const ev of await listEvents(token, grid.gridStart, grid.gridEnd)) {
            const last = ev.to < grid.gridEnd ? ev.to : grid.gridEnd;
            for (let d = ev.from > grid.gridStart ? ev.from : grid.gridStart; d <= last; d = addDays(d, 1)) {
              const list = result.googleByDate.get(d);
              if (list) list.push(ev);
              else result.googleByDate.set(d, [ev]);
            }
          }
        }
      }
    } catch (e) {
      logError("google-calendar", e);
      result.googleError = "Couldn't load your Google events.";
    }
    return result;
  }

  const [loaded, google, holidays, events, me] = await Promise.all([
    getMonthData(year, month)
      .then((d): { data: MonthData | null; error: string | null } => ({ data: d, error: null }))
      .catch((e): { data: MonthData | null; error: string | null } => {
        if (!(e instanceof TimesheetError)) logError("calendar", e);
        return { data: null, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
      }),
    loadGoogle(),
    // Holidays and festivals for the visible weeks. If they can't load, the calendar still works without them.
    listHolidaysBetween(grid.gridStart, grid.gridEnd).catch((e): Holiday[] => {
      logError("holidays", e);
      return [];
    }),
    // Company events, meetings and your own events. The calendar still works without them if they can't load.
    listStoredEvents(grid.gridStart, grid.gridEnd).catch((e): EventItem[] => {
      if (!(e instanceof TimesheetError)) logError("calendar-events", e);
      return [];
    }),
    getCurrentUser(),
  ]);
  const { data, error } = loaded;
  const { connected, showGoogle, googleError, googleByDate } = google;
  const gq = showGoogle ? "&gcal=1" : "";
  const holidayByDate = new Map<string, Holiday>();
  for (const h of holidays) holidayByDate.set(h.date, h);

  // ---- Derived values (only when data loaded) ----
  const cover = new Map<string, Cover>();
  const leaveDays = new Set<string>();
  const wfhDays = new Set<string>();
  let monthHours = 0;
  let daysLogged = 0;
  const logDates = new Set(data?.logDates ?? []);

  if (data) {
    for (const r of data.requests) {
      const start = r.from_date > grid.gridStart ? r.from_date : grid.gridStart;
      const end = r.to_date < grid.gridEnd ? r.to_date : grid.gridEnd;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const pending = r.status === "pending";
        const existing = cover.get(d);
        if (!existing || (existing.pending && !pending)) cover.set(d, { type: r.type, pending, compOff: r.comp_off });
        // Approved days inside this month, each day counted once.
        if (!pending && d.startsWith(ym)) (r.type === "leave" ? leaveDays : wfhDays).add(d);
      }
    }
    for (const [date, hours] of Object.entries(data.hoursByDate)) {
      if (date.startsWith(ym)) {
        monthHours += hours;
        daysLogged += 1;
      }
    }
    monthHours = Math.round(monthHours * 100) / 100;
  }

  // What is on each day, in plain data for the grid to draw.
  const days: DayView[] = data
    ? grid.days.map((date) => {
        const hours = data.hoursByDate[date] ?? 0;
        const tag = cover.get(date);
        const hol = holidayByDate.get(date);
        const wk = isWeekend(date);
        const items: DayItem[] = [];
        if (hol) {
          items.push({
            id: `h-${date}`,
            kind: "holiday",
            label: hol.name,
            detail: `${holidayTypeLabel(hol.type)} holiday${hol.description ? `. ${hol.description}` : ""}`,
          });
        }
        if (wk && !hol) items.push({ id: `o-${date}`, kind: "off", label: "Weekly off", detail: hours > 0 ? "You logged hours on a day off" : undefined });
        if (tag) {
          items.push({
            id: `r-${date}`,
            kind: tag.compOff ? "comp" : tag.type,
            label: tag.compOff ? "Comp-off" : tag.type === "leave" ? "Leave" : "WFH",
            detail: tag.pending ? "Waiting for approval" : "Approved",
          });
        }
        for (const ev of events) {
          if (ev.start > date || ev.end < date) continue;
          const at = ev.allDay ? "All day" : `${clock12(ev.startTime)}${ev.endTime ? ` – ${clock12(ev.endTime)}` : ""}`;
          items.push({
            id: `ev-${ev.id}-${date}`,
            kind: "event",
            label: ev.title,
            detail: [at, ev.location, calendarLabel(ev.calendar)].filter(Boolean).join(" · "),
            event: ev,
          });
        }
        for (const g of googleByDate.get(date) ?? []) {
          const span = g.from === g.to ? "1 day" : `${daysInclusive(g.from, g.to)} days`;
          items.push({ id: `g-${date}-${g.id}`, kind: "google", label: g.title, detail: g.allDay ? `All day, ${span}` : span });
        }
        const inMonth = date.startsWith(ym);
        const longLabel = `${formatYmd(date, { weekday: "long" })} ${formatYmd(date, { day: "numeric" })} ${formatYmd(date, { month: "long" })}`;
        const summary = [
          longLabel,
          date === today ? "today" : null,
          hours > 0 ? `${fmt(hours)} hours` : "no hours",
          ...items.map((i) => `${i.label}${i.detail ? ` (${i.detail})` : ""}`),
          logDates.has(date) ? "work log added" : null,
          inMonth ? null : "outside this month",
        ]
          .filter(Boolean)
          .join(", ");
        return {
          date,
          num: +date.slice(8),
          inMonth,
          isToday: date === today,
          isWeekend: wk,
          hours,
          fill: Math.min(hours / dailyTarget(), 1),
          hasLog: logDates.has(date),
          longLabel,
          summary,
          href: `/timesheet/worklog?view=day&date=${date}`,
          items,
        };
      })
    : [];

  return (
    <div className="ts-page">
      <header className="ts-page-head">
        <div>
          <h1 className="ts-h1">{title}</h1>
          {data && <p className="ts-muted ts-cal-sub">{fmt(monthHours)} h logged this month.</p>}
        </div>
        <CalendarNav
          prevHref={`${BASE}?month=${monthKey(prev.year, prev.month)}${gq}`}
          todayHref={showGoogle ? `${BASE}?gcal=1` : BASE}
          nextHref={`${BASE}?month=${monthKey(next.year, next.month)}${gq}`}
          isCurrentMonth={year === current.year && month === current.month}
          prevLabel={formatYmd(`${monthKey(prev.year, prev.month)}-01`, { month: "long", year: "numeric" })}
          nextLabel={formatYmd(`${monthKey(next.year, next.month)}-01`, { month: "long", year: "numeric" })}
        />
      </header>

      <GoogleCalendarCard
        configured={configured}
        connected={connected}
        show={showGoogle}
        month={ym}
        error={googleError}
        flash={first(sp.google) ?? null}
      />

      {error || !data ? (
        <section className="ts-card">
          <p className="ts-alert" role="alert">
            {error}
          </p>
          <Link href={`${BASE}?month=${ym}`} className="ts-btn ts-btn-sm">
            Try again
          </Link>
        </section>
      ) : (
        <>
          <CalendarGrid days={days} weekdays={WEEKDAYS} title={title} dailyTarget={dailyTarget()} today={today} isAdmin={me?.role === "admin"} myId={me?.id ?? ""} />

          <div className="ts-summary ts-summary-4">
            <section className="ts-card" aria-labelledby="sum-hours">
              <h2 className="ts-h2" id="sum-hours">
                Total hours
              </h2>
              <p className="ts-big">{fmt(monthHours)} h</p>
            </section>
            <section className="ts-card" aria-labelledby="sum-days">
              <h2 className="ts-h2" id="sum-days">
                Days with hours
              </h2>
              <p className="ts-big">{daysLogged}</p>
            </section>
            <section className="ts-card" aria-labelledby="sum-leave">
              <h2 className="ts-h2" id="sum-leave">
                Approved leave
              </h2>
              <p className="ts-big">
                {leaveDays.size} <span className="ts-muted">{leaveDays.size === 1 ? "day" : "days"}</span>
              </p>
            </section>
            <section className="ts-card" aria-labelledby="sum-wfh">
              <h2 className="ts-h2" id="sum-wfh">
                Approved WFH
              </h2>
              <p className="ts-big">
                {wfhDays.size} <span className="ts-muted">{wfhDays.size === 1 ? "day" : "days"}</span>
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
