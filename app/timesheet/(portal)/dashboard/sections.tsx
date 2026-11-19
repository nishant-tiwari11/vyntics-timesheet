import { formatRange, isWeekend, todayInOffice, workingDaysLabel } from "@/lib/timesheet/dates";
import { dailyTarget } from "@/lib/timesheet/settings";
import { CheckCircle2, Clock, Palmtree, TriangleAlert, CalendarOff, type LucideIcon } from "lucide-react";
import { Skeleton } from "../../_components/Skeleton";
import { UserAvatar } from "../../_components/UserAvatar";
import CancelButton from "./CancelButton";
import { loadOffDates, loadRequests, loadSnapshot, loadWeekStats } from "./data";

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

/** A ring that fills as you get to the target. The number beside it says the same thing, so colour is never the only signal. */
function Ring({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 1);
  return (
    <span className="ts-ring" aria-hidden="true">
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle cx="22" cy="22" r={r} className="ts-ring-track" />
        <circle cx="22" cy="22" r={r} className="ts-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 22 22)" />
      </svg>
      <span className="ts-ring-pct">{Math.round(p * 100)}%</span>
    </span>
  );
}

function Stat({
  tone,
  icon,
  value,
  of,
  label,
  ring,
  status,
}: {
  tone: string;
  icon: React.ReactNode;
  value: string;
  of?: string;
  label: string;
  ring?: number;
  status?: { kind: "good" | "warn" | "neutral"; text: string };
}) {
  return (
    <li className={`ts-stat ts-stat-${tone}`}>
      {ring !== undefined ? <Ring pct={ring} /> : <Icon>{icon}</Icon>}
      <p className="ts-stat-value">
        {value}
        {of && <span className="ts-stat-of">/{of}</span>}
      </p>
      <p className="ts-stat-label">{label}</p>
      {status && (
        <p className={`ts-stat-status ts-stat-status-${status.kind}`}>
          {status.kind === "good" ? (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          ) : status.kind === "warn" ? (
            <TriangleAlert className="size-3.5" aria-hidden="true" />
          ) : (
            <Clock className="size-3.5" aria-hidden="true" />
          )}
          {status.text}
        </p>
      )}
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
        ring={target > 0 ? hours / target : 0}
        status={
          target > 0 && hours >= target
            ? { kind: "good", text: "Target reached" }
            : { kind: "neutral", text: `${fmtHours(Math.max(target - hours, 0))} to go` }
        }
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
        status={{ kind: "good", text: met === 1 ? "1 day on target" : `${met} days on target` }}
      />
      <Stat
        tone="d"
        icon={<><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>}
        value={String(under)}
        of={String(elapsed)}
        label="Days under target"
        status={under > 0 ? { kind: "warn", text: "Needs attention" } : { kind: "good", text: "None, well done" }}
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
  // On a weekly off day nobody is "under", and anyone who works still shows their hours.
  const DAY_TARGET = dailyTarget();
  const weekend = isWeekend(todayInOffice());
  const holiday = res.data.some((p) => p.holiday);
  const ICON: Record<string, LucideIcon> = { met: CheckCircle2, under: TriangleAlert, leave: Palmtree, off: CalendarOff };
  return (
    <ul className="ts-snap-row">
      {people.map((p) => {
        const state = p.onLeave ? "leave" : p.hours >= DAY_TARGET ? "met" : weekend || holiday ? "off" : "under";
        const label = { leave: "Leave", met: "Met", under: "Under", off: holiday && !weekend ? "Holiday" : "Weekly off" }[state];
        const StateIcon = ICON[state];
        return (
          <li key={p.id} className="ts-snap">
            <div className="ts-snap-top">
              <UserAvatar userId={p.id} name={p.name} className="size-9 text-sm" />
              <span className="ts-snap-who">
                <span className="ts-snap-name">{p.name}</span>
                <span className="ts-snap-hours">
                  {fmtHours(p.hours)}
                  <span className="ts-muted">/{DAY_TARGET}h</span>
                </span>
              </span>
            </div>
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
            <span className={`ts-pill ts-pill-${state}`}>
              <StateIcon className="size-3" aria-hidden="true" /> {label}
            </span>
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

