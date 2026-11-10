import { formatRange, isWeekend, todayInOffice, workingDaysLabel } from "@/lib/timesheet/dates";
import { Skeleton } from "../../_components/Skeleton";
import CancelButton from "./CancelButton";
import { DAY_TARGET, loadOffDates, loadRequests, loadSnapshot, loadWeekStats } from "./data";

const TYPE_LABEL = { leave: "Leave", wfh: "WFH" } as const;

const fmtHours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

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
      <Skeleton height={tall ? 96 : 40} />
      <span className="ts-sr-only" role="status">
        Loading {title}…
      </span>
    </section>
  );
}

// ---------------------------- Stat cards ----------------------------

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="ts-stat-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

function Stat({ tone, icon, value, of, label }: { tone: string; icon: React.ReactNode; value: string; of?: string; label: string }) {
  return (
    <li className={`ts-stat ts-stat-${tone}`}>
      <Icon>{icon}</Icon>
      <p className="ts-stat-value">
        {value}
        {of && <span className="ts-stat-of">/{of}</span>}
      </p>
      <p className="ts-stat-label">{label}</p>
    </li>
  );
}

export async function StatCards() {
  const res = await loadWeekStats();
  if (!res.ok) return <SectionError message={res.error} />;
  const { hours, target, met, under, elapsed } = res.data;
  return (
    <ul className="ts-stats" aria-label="This week">
      <Stat
        tone="a"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
        value={fmtHours(hours)}
        label="Logged this week"
      />
      <Stat
        tone="b"
        icon={<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>}
        value={fmtHours(target)}
        label="Target this week"
      />
      <Stat
        tone="c"
        icon={<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>}
        value={String(met)}
        of={String(elapsed)}
        label="Days met target"
      />
      <Stat
        tone="d"
        icon={<><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>}
        value={String(under)}
        of={String(elapsed)}
        label="Days under target"
      />
    </ul>
  );
}

// ---------------------------- Today's snapshot (admin) ----------------------------

export async function SnapshotRow() {
  const res = await loadSnapshot();
  if (!res.ok) return <SectionError message={res.error} />;
  if (res.data.length === 0) return <p className="ts-muted">There are no employees yet.</p>;

  // People who still need to log come first.
  const people = [...res.data].sort(
    (a, b) => Number(a.onLeave) - Number(b.onLeave) || a.hours - b.hours || a.name.localeCompare(b.name)
  );
  // Saturday and Sunday are off: nobody is "under", and anyone who works still shows their hours.
  const weekend = isWeekend(todayInOffice());
  const holiday = res.data.some((p) => p.holiday);
  return (
    <ul className="ts-snap-row">
      {people.map((p) => {
        const state = p.onLeave ? "leave" : p.hours >= DAY_TARGET ? "met" : weekend || holiday ? "off" : "under";
        const label = { leave: "Leave", met: "Met", under: "Under", off: holiday && !weekend ? "Holiday" : "Weekly off" }[state];
        return (
          <li key={p.id} className="ts-snap">
            <p className="ts-snap-top">
              <span className="ts-snap-name">{p.name}</span>
              <span className="ts-snap-hours">
                {fmtHours(p.hours)}
                <span className="ts-muted">/{DAY_TARGET}h</span>
              </span>
            </p>
            <span className={`ts-pill ts-pill-${state}`}>{label}</span>
            <div
              className={`ts-meter ts-meter-${state}`}
              role="progressbar"
              aria-label={`${p.name}, hours today`}
              aria-valuemin={0}
              aria-valuemax={DAY_TARGET}
              aria-valuenow={Math.min(p.hours, DAY_TARGET)}
            >
              <span style={{ width: `${Math.min(p.hours / DAY_TARGET, 1) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------- Requests table ----------------------------

const REQUEST_STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

export async function RequestsTable() {
  const res = await loadRequests();
  const dates = res.ok ? res.data.flatMap((r) => [r.from_date, r.to_date]).sort() : [];
  const offDays = dates.length ? await loadOffDates(dates[0], dates[dates.length - 1]) : [];
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
            return (
              <div className="ts-empty">
                <strong>No requests yet</strong>
                <p>Leave and work from home requests you send will be listed here with their status.</p>
              </div>
            );
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
                    const range = formatRange(r.from_date, r.to_date);
                    return (
                      <tr key={r.id}>
                        <td data-label="Type">{r.comp_off ? "Comp-off" : r.type === "leave" ? "Leave" : "Work from home"}</td>
                        <td data-label="Dates">
                          {range} <span className="ts-muted">· {workingDaysLabel(r.from_date, r.to_date, offDays)}</span>
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

