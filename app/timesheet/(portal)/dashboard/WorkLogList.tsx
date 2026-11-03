import { formatTime, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import type { WorkLog } from "@/lib/timesheet/types";
import DeleteLogButton from "./DeleteLogButton";
import { loadLogs } from "./data";
import { SectionError } from "./sections";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  const weekday = formatYmd(date, { weekday: "long" });
  const rest = formatYmd(date, { day: "numeric", month: "short" });
  return `${weekday}, ${rest}`;
}

export default async function WorkLogList() {
  const res = await loadLogs();
  const today = todayInOffice();

  return (
    <section className="ts-card" aria-labelledby="card-worklog">
      <h2 className="ts-h2" id="card-worklog">
        Your work log
      </h2>
      {!res.ok ? (
        <SectionError message={res.error} />
      ) : res.data.length === 0 ? (
        <p className="ts-muted">Nothing logged yet. At the end of the day, write down what you worked on.</p>
      ) : (
        (() => {
          // Rows arrive newest day first; group them by date.
          const groups = new Map<string, WorkLog[]>();
          for (const row of res.data) {
            const list = groups.get(row.log_date) ?? [];
            list.push(row);
            groups.set(row.log_date, list);
          }
          return (
            <div className="ts-log-days">
              {[...groups.entries()].map(([date, entries]) => {
                const total = entries.reduce((sum, e) => sum + (e.hours ?? 0), 0);
                const headingId = `log-day-${date}`;
                return (
                  <section key={date} aria-labelledby={headingId} className="ts-log-day">
                    <div className="ts-log-day-head">
                      <h3 id={headingId} className="ts-h3">
                        {dayHeading(date, today)}
                      </h3>
                      {total > 0 && <span className="ts-muted ts-small">{fmt(total)} h logged</span>}
                    </div>
                    <ul className="ts-log-list">
                      {entries.map((e) => (
                        <li key={e.id} className="ts-log-item">
                          <div className="ts-log-body">
                            {/* React escapes this text; pre-wrap keeps the person's line breaks. */}
                            <p className="ts-log-text">{e.content}</p>
                            <p className="ts-log-meta ts-muted">
                              {e.hours != null && <span>({fmt(e.hours)} h) · </span>}
                              <span>Added at {formatTime(e.created_at)}</span>
                            </p>
                          </div>
                          {date === today && <DeleteLogButton id={e.id} />}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          );
        })()
      )}
    </section>
  );
}
