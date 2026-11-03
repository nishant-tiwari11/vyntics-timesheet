import { addDays, daysInclusive, formatRange, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { dayTotals, weekTotal } from "@/lib/timesheet/hours";
import type { Request } from "@/lib/timesheet/types";
import CancelButton from "./CancelButton";
import { loadMonthHours, loadRequests, loadWeek } from "./data";

const TARGET_HOURS = 40;
const DAY_TARGET = 8;

const WEEK_STATUS = {
  draft: "Draft",
  sent_back: "Sent back",
  submitted: "Submitted",
  approved: "Approved",
} as const;

const TYPE_LABEL = { leave: "Leave", wfh: "WFH" } as const;

const fmtHours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

// ---------------------------- Shared states ----------------------------

export function SectionError({ message }: { message: string }) {
  return (
    <p className="ts-alert" role="alert">
      {message}
    </p>
  );
}

export function CardSkeleton({ title, tall }: { title: string; tall?: boolean }) {
  return (
    <section className="ts-card" aria-busy="true" aria-label={`${title}, loading`}>
      <h2 className="ts-h2">{title}</h2>
      <div className="ts-skel" style={{ height: tall ? 96 : 40 }} />
      <span className="ts-sr-only" role="status">
        Loading {title}…
      </span>
    </section>
  );
}

// ---------------------------- Summary cards ----------------------------

export async function WeekCard() {
  const res = await loadWeek();
  return (
    <section className="ts-card" aria-labelledby="card-week">
      <h2 className="ts-h2" id="card-week">
        This week
      </h2>
      {!res.ok ? (
        <SectionError message={res.error} />
      ) : (
        (() => {
          const total = res.data.week ? weekTotal(res.data.week.timesheet_rows) : 0;
          const status = res.data.week?.status ?? "draft";
          const pct = Math.min((total / TARGET_HOURS) * 100, 100);
          return (
            <>
              <p className="ts-big">
                {fmtHours(total)} <span className="ts-muted">of {TARGET_HOURS} h</span>
                <span className={`ts-chip ts-chip-${status}`}>{WEEK_STATUS[status]}</span>
              </p>
              <div
                className="ts-progress"
                role="progressbar"
                aria-label="Hours this week"
                aria-valuemin={0}
                aria-valuemax={TARGET_HOURS}
                aria-valuenow={Math.min(total, TARGET_HOURS)}
                aria-valuetext={`${total} of ${TARGET_HOURS} hours`}
              >
                <div className="ts-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </>
          );
        })()
      )}
    </section>
  );
}

export async function MonthCard() {
  const res = await loadMonthHours();
  const month = formatYmd(todayInOffice(), { month: "long", year: "numeric" });
  return (
    <section className="ts-card" aria-labelledby="card-month">
      <h2 className="ts-h2" id="card-month">
        This month
      </h2>
      {!res.ok ? (
        <SectionError message={res.error} />
      ) : (
        <>
          <p className="ts-big">{fmtHours(res.data)}</p>
          <p className="ts-muted ts-small">{month}</p>
        </>
      )}
    </section>
  );
}

export async function RequestsCard() {
  const res = await loadRequests();
  return (
    <section className="ts-card" aria-labelledby="card-requests">
      <h2 className="ts-h2" id="card-requests">
        Leave and WFH
      </h2>
      {!res.ok ? (
        <SectionError message={res.error} />
      ) : (
        (() => {
          const today = todayInOffice();
          const pending = res.data.filter((r) => r.status === "pending").length;
          const next = res.data
            .filter((r) => r.status === "approved" && r.to_date >= today)
            .sort((a, b) => a.from_date.localeCompare(b.from_date))[0];
          return (
            <>
              <p className="ts-big">
                {pending} <span className="ts-muted">pending</span>
              </p>
              <p className="ts-small">
                {next ? (
                  <>
                    <span className="ts-muted">Next approved: </span>
                    {TYPE_LABEL[next.type]}, {formatRange(next.from_date, next.to_date)}
                  </>
                ) : (
                  <span className="ts-muted">Nothing approved coming up.</span>
                )}
              </p>
            </>
          );
        })()
      )}
    </section>
  );
}

// ---------------------------- Week strip ----------------------------

export async function WeekStrip() {
  const [weekRes, reqRes] = await Promise.all([loadWeek(), loadRequests()]);
  return (
    <section className="ts-card" aria-labelledby="card-strip">
      <h2 className="ts-h2" id="card-strip">
        This week
      </h2>
      {!weekRes.ok ? (
        <SectionError message={weekRes.error} />
      ) : (
        (() => {
          const { weekStart, week } = weekRes.data;
          const today = todayInOffice();
          const hours = dayTotals(week?.timesheet_rows);
          const requests = reqRes.ok
            ? reqRes.data.filter((r) => r.status === "pending" || r.status === "approved")
            : [];
          return (
            <>
              {!reqRes.ok && (
                <p className="ts-small ts-muted" role="status">
                  Leave and WFH tags couldn&apos;t be loaded.
                </p>
              )}
              <ol className="ts-strip">
                {hours.map((h, i) => {
                  const date = addDays(weekStart, i);
                  const req: Request | undefined = requests.find((r) => r.from_date <= date && date <= r.to_date);
                  const weekend = i >= 5;
                  const isToday = date === today;
                  const long = formatYmd(date, { weekday: "long", day: "numeric", month: "long" });
                  const label =
                    `${long}${isToday ? " (today)" : ""}: ${h} hours` +
                    (req ? `, ${TYPE_LABEL[req.type]}${req.status === "pending" ? " (pending approval)" : ""}` : "");
                  return (
                    <li
                      key={date}
                      className={`ts-day${weekend ? " is-weekend" : ""}${isToday ? " is-today" : ""}`}
                      aria-label={label}
                      aria-current={isToday ? "date" : undefined}
                    >
                      <span className="ts-day-name" aria-hidden="true">
                        {formatYmd(date, { weekday: "short" })}
                      </span>
                      <span className="ts-day-date" aria-hidden="true">
                        {formatYmd(date, { day: "numeric" })}
                      </span>
                      <span className="ts-day-bar" aria-hidden="true">
                        <span className="ts-day-fill" style={{ height: `${Math.min(h / DAY_TARGET, 1) * 100}%` }} />
                      </span>
                      <span className="ts-day-hours" aria-hidden="true">
                        {h}h
                      </span>
                      <span className="ts-day-tag-slot" aria-hidden="true">
                        {req && (
                          <span className={`ts-tag ts-tag-${req.type}${req.status === "pending" ? " is-pending" : ""}`}>
                            {TYPE_LABEL[req.type]}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          );
        })()
      )}
    </section>
  );
}

// ---------------------------- Requests table ----------------------------

const REQUEST_STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

export async function RequestsTable() {
  const res = await loadRequests();
  return (
    <section className="ts-card" aria-labelledby="card-table">
      <h2 className="ts-h2" id="card-table">
        Your requests
      </h2>
      {!res.ok ? (
        <SectionError message={res.error} />
      ) : (
        (() => {
          // Cancelled requests are hidden; newest first.
          const rows = res.data
            .filter((r) => r.status !== "cancelled")
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          if (rows.length === 0) {
            return <p className="ts-muted">You haven&apos;t made any requests yet.</p>;
          }
          return (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption className="ts-sr-only">Your leave and work from home requests, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Dates</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="ts-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const n = daysInclusive(r.from_date, r.to_date);
                    const range = formatRange(r.from_date, r.to_date);
                    return (
                      <tr key={r.id}>
                        <td data-label="Type">{r.type === "leave" ? "Leave" : "Work from home"}</td>
                        <td data-label="Dates">
                          {range} <span className="ts-muted">· {n} {n === 1 ? "day" : "days"}</span>
                        </td>
                        <td data-label="Reason">{r.reason || <span className="ts-muted">—</span>}</td>
                        <td data-label="Status">
                          <span className={`ts-chip ts-chip-${r.status}`}>{REQUEST_STATUS[r.status]}</span>
                        </td>
                        <td className="ts-actions">
                          {r.status === "pending" && (
                            <CancelButton id={r.id} label={`${TYPE_LABEL[r.type]} request, ${range}`} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()
      )}
    </section>
  );
}

