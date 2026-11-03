import { logError } from "@/lib/timesheet/log";
import "../dashboard/dashboard.css"; // shared chips, tags, skeleton, buttons
import "../timesheet/timesheet-page.css"; // week navigation buttons
import "./calendar.css";
import Link from "next/link";
import { addDays, formatYmd, mondayOf, monthGrid, monthKey, parseMonth, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { getMonthData, type MonthData } from "@/lib/timesheet/calendar";
import CalendarNav from "./CalendarNav";

export const metadata = { title: "Calendar" };

const BASE = "/timesheet/calendar";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TARGET = 8;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

type Cover = { type: "leave" | "wfh"; pending: boolean };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;
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
        if (!existing || (existing.pending && !pending)) cover.set(d, { type: r.type, pending });
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
    <div className="ts-sheet-page">
      <header className="ts-sheet-head">
        <div>
          <h1 className="ts-h1">{title}</h1>
          {data && <p className="ts-muted ts-cal-sub">{fmt(monthHours)} h logged this month.</p>}
        </div>
        <CalendarNav
          prevHref={`${BASE}?month=${monthKey(prev.year, prev.month)}`}
          todayHref={BASE}
          nextHref={`${BASE}?month=${monthKey(next.year, next.month)}`}
          isCurrentMonth={year === current.year && month === current.month}
          prevLabel={formatYmd(`${monthKey(prev.year, prev.month)}-01`, { month: "long", year: "numeric" })}
          nextLabel={formatYmd(`${monthKey(next.year, next.month)}-01`, { month: "long", year: "numeric" })}
        />
      </header>

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
                const inMonth = date.startsWith(ym);
                const isToday = date === today;
                const label =
                  [
                    `${formatYmd(date, { weekday: "long" })} ${formatYmd(date, { day: "numeric" })} ${formatYmd(date, { month: "long" })}`,
                    isToday ? "today" : null,
                    hours > 0 ? `${fmt(hours)} hours` : "no hours",
                    tag ? `${tag.type === "leave" ? "Leave" : "Work from home"}${tag.pending ? " (pending)" : ""}` : null,
                    hasLog ? "work log added" : null,
                    inMonth ? null : "outside this month",
                  ]
                    .filter(Boolean)
                    .join(", ");
                return (
                  <li key={date} className="ts-cal-cell">
                    <Link
                      href={`/timesheet/timesheet?week=${mondayOf(date)}`}
                      aria-label={label}
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
                      <span className="ts-cal-bottom" aria-hidden="true">
                        {tag && (
                          <span className={`ts-tag ts-tag-${tag.type}${tag.pending ? " is-pending" : ""}`}>
                            <span className="ts-cal-tag-full">{tag.type === "leave" ? "Leave" : "WFH"}</span>
                            <span className="ts-cal-tag-short">{tag.type === "leave" ? "L" : "W"}</span>
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
              <span className="ts-tag ts-tag-leave">Leave</span>
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
