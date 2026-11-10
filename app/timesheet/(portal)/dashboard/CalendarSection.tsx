import Link from "next/link";
import { displayName } from "@/lib/timesheet/people";
import LogCalendar from "./LogCalendar";
import { calHref, calRange, type CalEvent, type CalOff, type CalQuery } from "./calendarQuery";
import { listHolidaysBetween } from "@/lib/timesheet/holidays";
import { loadCalendarLogs, loadCalendarOff } from "./data";
import type { LogQuery } from "./logQuery";
import { SectionError } from "./sections";

// Loads just the dates the chosen view shows, then hands plain data to the interactive calendar.
export default async function CalendarSection({
  isAdmin,
  myId,
  today,
  log,
  cal,
}: {
  isAdmin: boolean;
  myId: string;
  today: string;
  log: LogQuery;
  cal: CalQuery;
}) {
  const { from, to } = calRange(cal);
  const scope = isAdmin ? "all" : "mine";
  const [logs, offRes, holidays] = await Promise.all([
    loadCalendarLogs(scope, from, to),
    loadCalendarOff(scope, from, to),
    // The calendar still works without holidays if they can't load.
    listHolidaysBetween(from, to).catch(() => []),
  ]);

  if (!logs.ok || !offRes.ok) {
    const message = !logs.ok ? logs.error : !offRes.ok ? offRes.error : "";
    return (
      <section className="ts-section" id="calendar" aria-labelledby="cal-error-title">
        <h2 className="ts-h2s" id="cal-error-title">
          Calendar
        </h2>
        <div className="ts-card">
          <SectionError message={message} />
          <Link href={calHref(log, cal, today)} className="ts-btn ts-btn-sm">
            Try again
          </Link>
        </div>
      </section>
    );
  }

  const off: CalOff[] = offRes.data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    who: displayName(r.owner),
    type: r.type,
    compOff: r.comp_off,
    from: r.from_date,
    to: r.to_date,
    note: r.reason ?? "",
  }));

  const events: CalEvent[] = logs.data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    who: displayName(r.owner),
    date: r.log_date,
    start: (r.start_time ?? "00:00").slice(0, 5),
    end: (r.end_time ?? "00:00").slice(0, 5),
    hours: r.hours,
    project: r.project ?? "",
    text: r.content,
    noCompOff: r.no_comp_off,
    status: r.status,
  }));

  return (
    <section className="ts-section" id="calendar" aria-label="Calendar">
      <LogCalendar events={events} off={off} holidays={holidays} cal={cal} log={log} today={today} myId={myId} isAdmin={isAdmin} />
    </section>
  );
}
