import Link from "next/link";
import { daysInclusive, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { holidayTypeLabel, type Holiday } from "@/lib/timesheet/holidayTypes";
import { upcomingHolidays } from "@/lib/timesheet/holidays";
import { logError } from "@/lib/timesheet/log";
import { SectionError } from "./sections";

/** "Today", "Tomorrow" or "In 12 days". */
function when(date: string, today: string): string {
  const n = daysInclusive(today, date) - 1;
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

// The next few holidays from today on. Loads on its own, so a failure here never affects the rest of the page.
export default async function UpcomingHolidays({ isAdmin }: { isAdmin: boolean }) {
  const today = todayInOffice();
  let list: Holiday[] = [];
  let error: string | null = null;
  try {
    list = await upcomingHolidays(today, 5);
  } catch (e) {
    logError("upcoming-holidays", e);
    error = "Couldn't load holidays. Please try again.";
  }

  return (
    <section className="ts-card" aria-labelledby="upcoming-title">
      <div className="ts-section-head">
        <h2 className="ts-h2" id="upcoming-title">
          Upcoming holidays
        </h2>
        {isAdmin && (
          <Link href="/timesheet/admin?tab=holidays" className="ts-link">
            Manage holidays
          </Link>
        )}
      </div>
      {error ? (
        <SectionError message={error} />
      ) : list.length === 0 ? (
        <div className="ts-empty">
          <strong>No upcoming holidays</strong>
          <p>{isAdmin ? "Add them under Admin, then Holidays." : "Your admin hasn't added any yet."}</p>
        </div>
      ) : (
        <ul className="ts-upcoming">
          {list.map((h) => (
            <li key={h.id}>
              <span className="ts-upcoming-date">
                <strong>{formatYmd(h.date, { day: "numeric" })}</strong>
                <span>{formatYmd(h.date, { month: "short" })}</span>
              </span>
              <span className="ts-upcoming-main">
                <span className="ts-upcoming-name">{h.name}</span>
                <span className="ts-muted">
                  {formatYmd(h.date, { weekday: "long" })} · {when(h.date, today)}
                </span>
              </span>
              <span className={`ts-hol ts-hol-${h.type}`}>{holidayTypeLabel(h.type)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
