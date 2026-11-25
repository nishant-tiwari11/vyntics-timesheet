import Link from "next/link";
import { CalendarDays, CalendarOff, Home, PartyPopper, Palmtree, Sparkles, type LucideIcon } from "lucide-react";
import { addDays, daysInclusive, formatRange, formatYmd, isWeekend, mondayOf } from "@/lib/timesheet/dates";
import { listUpcomingEvents } from "@/lib/timesheet/events";
import { dailyTarget } from "@/lib/timesheet/settings";
import { listHolidaysBetween } from "@/lib/timesheet/holidays";
import { TimesheetError } from "@/lib/timesheet/errors";
import { holidayTypeLabel, type Holiday } from "@/lib/timesheet/holidayTypes";
import { logError } from "@/lib/timesheet/log";
import "../calendar/calendar.css"; // the shared colours for leave, WFH and holiday tags
import { clock12 } from "../worklog/model";
import { loadCalendarLogs, loadCalendarOff } from "./data";
import { SectionError } from "./sections";

type Off = { from: string; to: string; kind: "leave" | "wfh" | "comp" };

const KIND: Record<"leave" | "wfh" | "comp" | "holiday" | "off" | "event", { label: string; Icon: LucideIcon }> = {
  event: { label: "Event", Icon: CalendarDays },
  leave: { label: "Leave", Icon: Palmtree },
  wfh: { label: "WFH", Icon: Home },
  comp: { label: "Comp-off", Icon: Sparkles },
  holiday: { label: "Holiday", Icon: PartyPopper },
  off: { label: "Off", Icon: CalendarOff },
};

const fmtHours = (n: number) => `${Math.round(n * 100) / 100}h`;
const when = (date: string, today: string) => {
  const n = daysInclusive(today, date) - 1;
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
};

/** How far ahead the "Upcoming" list looks for leave and work from home. */
const LOOK_AHEAD_DAYS = 90;

// A compact look at your week and what is coming next. Your own days only; the full month is on the Calendar page.
export default async function WeekAhead({ today, isAdmin = false }: { today: string; isAdmin?: boolean }) {
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const horizon = addDays(today, LOOK_AHEAD_DAYS);
  const [logs, offRes, holidays, events] = await Promise.all([
    loadCalendarLogs("mine", monday, sunday),
    loadCalendarOff("mine", monday, horizon),
    // The strip still works without holidays if they can't load.
    listHolidaysBetween(monday, horizon).catch((e): Holiday[] => {
      // An expired sign-in is expected and already shown by the rest of the page; only log real problems.
      if (!(e instanceof TimesheetError)) logError("week-ahead-holidays", e);
      return [];
    }),
    // Company events and meetings. The list still works without them if they can't load.
    listUpcomingEvents(today, horizon, 10).catch((e): Awaited<ReturnType<typeof listUpcomingEvents>> => {
      if (!(e instanceof TimesheetError)) logError("week-ahead-events", e);
      return [];
    }),
  ]);

  if (!logs.ok || !offRes.ok) {
    return (
      <section className="ts-card" aria-labelledby="week-title">
        <h2 className="ts-h2" id="week-title">
          This week
        </h2>
        <SectionError message={!logs.ok ? logs.error : !offRes.ok ? offRes.error : ""} />
      </section>
    );
  }

  const hoursByDate = new Map<string, number>();
  for (const l of logs.data) {
    if (l.status === "rejected") continue;
    hoursByDate.set(l.log_date, (hoursByDate.get(l.log_date) ?? 0) + (l.hours ?? 0));
  }
  const off: Off[] = offRes.data.map((r) => ({ from: r.from_date, to: r.to_date, kind: r.comp_off ? "comp" : r.type }));
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const dayTarget = dailyTarget();

  // Upcoming: the next five things from today, soonest first.
  type Next = { id: string; date: string; label: string; detail: string; kind: "leave" | "wfh" | "comp" | "holiday" | "event" };
  const next: Next[] = [
    ...holidays
      .filter((h) => h.date >= today)
      .map((h): Next => ({ id: `h-${h.id}`, date: h.date, label: h.name, detail: h.type === "optional" ? "Optional holiday" : holidayTypeLabel(h.type), kind: "holiday" })),
    ...events.map((ev): Next => {
      const at = ev.allDay ? "All day" : `${clock12(ev.startTime)}${ev.endTime ? ` – ${clock12(ev.endTime)}` : ""}`;
      return {
        id: `e-${ev.id}`,
        date: ev.start > today ? ev.start : today,
        label: ev.title,
        detail: [ev.start === ev.end ? at : formatRange(ev.start, ev.end), ev.location].filter(Boolean).join(" · "),
        kind: "event",
      };
    }),
    ...offRes.data
      .filter((r) => r.to_date >= today)
      .map((r): Next => {
        const date = r.from_date > today ? r.from_date : today;
        return {
          id: `r-${r.id}`,
          date,
          label: r.comp_off ? "Comp-off" : r.type === "leave" ? "Leave" : "Work from home",
          detail: formatRange(r.from_date, r.to_date),
          kind: r.comp_off ? "comp" : r.type,
        };
      }),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="ts-week-grid">
      <section className="ts-card" aria-labelledby="week-title">
        <div className="ts-section-head">
          <h2 className="ts-h2" id="week-title">
            This week
          </h2>
          <Link href="/timesheet/calendar" className="ts-link">
            View full calendar
          </Link>
        </div>
        <ol className="ts-week-strip">
          {days.map((date) => {
            const hours = hoursByDate.get(date) ?? 0;
            const hol = holidayByDate.get(date);
            const o = off.find((x) => x.from <= date && date <= x.to);
            const tags: (keyof typeof KIND)[] = [];
            if (hol) tags.push("holiday");
            else if (isWeekend(date)) tags.push("off");
            if (o) tags.push(o.kind);
            const isToday = date === today;
            const name = formatYmd(date, { weekday: "long" });
            const say = [
              `${name} ${formatYmd(date, { day: "numeric" })} ${formatYmd(date, { month: "long" })}`,
              isToday ? "today" : null,
              hours > 0 ? `${fmtHours(hours)} logged` : "no hours logged",
              ...tags.map((t) => (t === "holiday" && hol ? `holiday, ${hol.name}` : KIND[t].label)),
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <li key={date}>
                <Link
                  href={`/timesheet/worklog?view=day&date=${date}`}
                  className={`ts-week-tile${isToday ? " is-today" : ""}${tags.includes("off") ? " is-off" : ""}`}
                  aria-label={say}
                  aria-current={isToday ? "date" : undefined}
                >
                  <span className="ts-week-dow" aria-hidden="true">
                    {formatYmd(date, { weekday: "short" })}
                  </span>
                  <span className="ts-week-num" aria-hidden="true">
                    {+date.slice(8)}
                  </span>
                  <span className="ts-week-hours" aria-hidden="true">
                    {hours > 0 ? fmtHours(hours) : "—"}
                  </span>
                  <span className="ts-week-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(hours / dayTarget, 1) * 100}%` }} />
                  </span>
                  <span className="ts-week-tags" aria-hidden="true">
                    {tags.map((t) => {
                      const { Icon, label } = KIND[t];
                      return (
                        <span key={t} className={`ts-ev ts-ev-${t} is-compact`} title={t === "holiday" && hol ? hol.name : label}>
                          <Icon className="size-3 shrink-0" aria-hidden="true" />
                          <span className="ts-week-tag-text">{label}</span>
                        </span>
                      );
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ts-card" aria-labelledby="next-title">
        <div className="ts-section-head">
          <h2 className="ts-h2" id="next-title">
            Upcoming
          </h2>
          {isAdmin && (
            <Link href="/timesheet/admin?tab=holidays" className="ts-link">
              Manage holidays
            </Link>
          )}
        </div>
        {next.length === 0 ? (
          <div className="ts-empty">
            <strong>Nothing coming up</strong>
            <p>Approved leave, work from home and holidays will show here.</p>
          </div>
        ) : (
          <ul className="ts-upcoming">
            {next.map((n) => {
              const { Icon, label } = KIND[n.kind];
              return (
                <li key={n.id}>
                  <span className="ts-upcoming-date">
                    <strong>{formatYmd(n.date, { day: "numeric" })}</strong>
                    <span>{formatYmd(n.date, { month: "short" })}</span>
                  </span>
                  <span className="ts-upcoming-main">
                    <span className="ts-upcoming-name">{n.label}</span>
                    <span className="ts-muted">{n.detail}</span>
                  </span>
                  <span className={`ts-ev ts-ev-${n.kind}`}>
                    <Icon className="size-3 shrink-0" aria-hidden="true" />
                    {label} · {when(n.date, today)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
