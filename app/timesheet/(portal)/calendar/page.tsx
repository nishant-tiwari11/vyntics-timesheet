import { logError } from "@/lib/timesheet/log";
import "../dashboard/dashboard.css"; // shared chips, tags, skeleton, buttons
import "./calendar.css";
import Link from "next/link";
import { addDays, formatYmd, monthGrid, monthKey, parseMonth, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { getMonthData, type MonthData } from "@/lib/timesheet/calendar";
import { holidayTypeLabel, type Holiday } from "@/lib/timesheet/holidayTypes";
import { listHolidaysBetween } from "@/lib/timesheet/holidays";
import { googleConfig } from "@/lib/google/config";
import { accessTokenFor, isConnected } from "@/lib/google/connection";
import { listEvents, type GoogleEvent } from "@/lib/google/events";
import { requireUser } from "@/lib/timesheet/auth";
import CalendarNav from "./CalendarNav";
import GoogleCalendarCard from "./GoogleCalendarCard";

export const metadata = { title: "Calendar" };

const BASE = "/timesheet/calendar";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TARGET = 8;

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

  let data: MonthData | null = null;
  let error: string | null = null;
  try {
    data = await getMonthData(year, month);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("calendar", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  // ---- Google Calendar (optional): status, and the person's own events when "Show Google events" is on ----
  const configured = googleConfig() !== null;
  let connected = false;
  let showGoogle = false;
  let googleError: string | null = null;
  const googleByDate = new Map<string, GoogleEvent[]>();
  if (configured) {
    try {
      connected = await isConnected();
      showGoogle = connected && first(sp.gcal) === "1";
      if (showGoogle) {
        const me = await requireUser();
        const token = await accessTokenFor(me.id);
        if (!token) {
          connected = false; // Google access was removed; the card now offers to connect again
          showGoogle = false;
        } else {
          for (const ev of await listEvents(token, grid.gridStart, grid.gridEnd)) {
            const last = ev.to < grid.gridEnd ? ev.to : grid.gridEnd;
            for (let d = ev.from > grid.gridStart ? ev.from : grid.gridStart; d <= last; d = addDays(d, 1)) {
              const list = googleByDate.get(d);
              if (list) list.push(ev);
              else googleByDate.set(d, [ev]);
            }
          }
        }
      }
    } catch (e) {
      logError("google-calendar", e);
      googleError = "Couldn't load your Google events.";
    }
  }
  const gq = showGoogle ? "&gcal=1" : "";

  // Holidays and festivals for the visible weeks. If they can't load, the calendar still works without them.
  const holidayByDate = new Map<string, Holiday>();
  try {
    for (const h of await listHolidaysBetween(grid.gridStart, grid.gridEnd)) holidayByDate.set(h.date, h);
  } catch (e) {
    logError("holidays", e);
  }

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
          <section className="ts-card ts-cal-card" aria-label={`Calendar for ${title}`}>
            <div className="ts-cal-weekdays" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <ol className="ts-cal-grid">
              {grid.days.map((date, i) => {
                const hours = data.hoursByDate[date] ?? 0;
                const tag = cover.get(date);
                const hasLog = logDates.has(date);
                const dayOff = i % 7 >= 5 || (holidayByDate.has(date) && holidayByDate.get(date)!.type !== "optional");
                const worked = dayOff && hours > 0;
                const inMonth = date.startsWith(ym);
                const isToday = date === today;
                const label =
                  [
                    `${formatYmd(date, { weekday: "long" })} ${formatYmd(date, { day: "numeric" })} ${formatYmd(date, { month: "long" })}`,
                    isToday ? "today" : null,
                    hours > 0 ? `${fmt(hours)} hours` : "no hours",
                    tag ? `${tag.compOff ? "Comp-off" : tag.type === "leave" ? "Leave" : "Work from home"}${tag.pending ? " (pending)" : ""}` : null,
                    hasLog ? "work log added" : null,
                    holidayByDate.has(date) ? `Holiday: ${holidayByDate.get(date)!.name}, ${holidayTypeLabel(holidayByDate.get(date)!.type)}` : i % 7 >= 5 ? "Week off" : null,
                    worked ? "worked on a day off" : null,
                    googleByDate.has(date) ? `Google events: ${googleByDate.get(date)!.map((g) => g.title).join(", ")}` : null,
                    inMonth ? null : "outside this month",
                  ]
                    .filter(Boolean)
                    .join(", ");
                return (
                  <li key={date} className="ts-cal-cell">
                    <Link
                      href={`/timesheet/dashboard?cal=day&on=${date}#calendar`}
                      aria-label={`${label}. Open this day`}
                      aria-current={isToday ? "date" : undefined}
                      className={`ts-cal-day${i % 7 >= 5 ? " is-weekend" : ""}${inMonth ? "" : " is-other"}${isToday ? " is-today" : ""}`}
                    >
                      <span
                        className="ts-cal-fill"
                        aria-hidden="true"
                        style={{ height: `${Math.min(hours / DAY_TARGET, 1) * 100}%` }}
                      />
                      <span className="ts-cal-top" aria-hidden="true">
                        <span className="ts-cal-num">{+date.slice(8)}</span>
                        {hasLog && <span className="ts-cal-dot" />}
                      </span>
                      {!holidayByDate.has(date) && i % 7 >= 5 && !tag && (
                        <span className="ts-hol ts-hol-weekoff" aria-hidden="true">
                          Week off
                        </span>
                      )}
                      {worked && (
                        <span className="ts-hol ts-hol-worked" aria-hidden="true" title="You logged hours on a day off">
                          Worked
                        </span>
                      )}
                      {holidayByDate.has(date) && (
                        <span
                          className={`ts-hol ts-hol-${holidayByDate.get(date)!.type}`}
                          aria-hidden="true"
                          title={`${holidayByDate.get(date)!.name} (${holidayTypeLabel(holidayByDate.get(date)!.type)})${holidayByDate.get(date)!.description ? `. ${holidayByDate.get(date)!.description}` : ""}`}
                        >
                          {holidayByDate.get(date)!.type === "optional" ? "" : "Holiday: "}
                          {holidayByDate.get(date)!.name}
                        </span>
                      )}
                      {googleByDate.has(date) && (
                        <span className="ts-gcal" aria-hidden="true">
                          {googleByDate.get(date)!.slice(0, 2).map((g) => (
                            <span key={g.id} className="ts-gcal-chip" title={g.title}>
                              {g.title}
                            </span>
                          ))}
                          {googleByDate.get(date)!.length > 2 && (
                            <span className="ts-gcal-more">+{googleByDate.get(date)!.length - 2} more</span>
                          )}
                        </span>
                      )}
                      <span className="ts-cal-bottom" aria-hidden="true">
                        {tag && (
                          <span className={`ts-tag ts-tag-${tag.type}${tag.compOff ? " ts-tag-comp" : ""}${tag.pending ? " is-pending" : ""}`}>
                            <span className="ts-cal-tag-full">{tag.compOff ? "Comp-off" : tag.type === "leave" ? "Leave" : "WFH"}</span>
                            <span className="ts-cal-tag-short">{tag.compOff ? "C" : tag.type === "leave" ? "L" : "W"}</span>
                          </span>
                        )}
                        {hours > 0 && <span className="ts-cal-hours">{fmt(hours)} h</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <ul className="ts-legend" aria-label="Legend">
            <li>
              <span className="ts-legend-swatch ts-legend-fill" aria-hidden="true" /> Fill = hours (full at {DAY_TARGET} h)
            </li>
            <li>
              <span className="ts-hol ts-hol-weekoff">Week off</span>
            </li>
            <li>
              <span className="ts-hol ts-hol-public">Public</span>
            </li>
            <li>
              <span className="ts-hol ts-hol-optional">Optional</span>
            </li>
            <li>
              <span className="ts-tag ts-tag-leave">Leave</span>
            </li>
            <li>
              <span className="ts-tag ts-tag-comp">Comp-off</span>
            </li>
            <li>
              <span className="ts-hol ts-hol-worked">Worked</span> = hours logged on a day off
            </li>
            <li>
              <span className="ts-tag ts-tag-wfh">WFH</span>
            </li>
            <li>
              <span className="ts-tag ts-tag-leave is-pending">Faded</span> = pending
            </li>
            <li>
              <span className="ts-cal-dot" aria-hidden="true" /> = work log added
            </li>
          </ul>

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
