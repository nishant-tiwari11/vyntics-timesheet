import Link from "next/link";
import { listApprovedLeaveBetween, listEmployees, type Employee, type LeaveCover } from "@/lib/timesheet/admin";
import { addDays, formatTime, formatYmd, isYmd, mondayOf, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { weekTotal } from "@/lib/timesheet/hours";
import { listAllLogs } from "@/lib/timesheet/logs";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { listAllRequests } from "@/lib/timesheet/requests";
import type { RequestWithPerson, WeekWithPerson, WorkLogWithPerson } from "@/lib/timesheet/types";
import { listAllWeeks } from "@/lib/timesheet/weeks";
import { SectionError } from "../dashboard/sections";
import EmployeesTable from "./EmployeesTable";
import RequestsTable, { type RequestRowData } from "./RequestsTable";
import WeeksTable, { type WeekRowData } from "./WeeksTable";

const BASE = "/timesheet/admin";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

// Data is loaded inside try/catch; the page (JSX) is built outside it.
async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin", e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}

function LoadError({ message, retryHref }: { message: string; retryHref: string }) {
  return (
    <section className="ts-card">
      <SectionError message={message} />
      <Link href={retryHref} className="ts-btn ts-btn-sm">
        Try again
      </Link>
    </section>
  );
}

function Stat({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="ts-card" aria-labelledby={id}>
      <h2 className="ts-h2" id={id}>
        {title}
      </h2>
      <p className="ts-big">{children}</p>
    </section>
  );
}

// ------------------------------- Timesheets -------------------------------

export async function TimesheetsTab({ adminId, weekParam }: { adminId: string; weekParam?: string }) {
  const thisMonday = mondayOf(todayInOffice());
  const weekStart = isYmd(weekParam) ? mondayOf(weekParam) : thisMonday;
  const link = (w?: string) => `${BASE}?tab=timesheets${w ? `&week=${w}` : ""}`;

  const res = await load<{ people: Employee[]; weeks: WeekWithPerson[] }>(async () => {
    const [people, weeks] = await Promise.all([listEmployees(), listAllWeeks(weekStart)]);
    return { people, weeks };
  });

  let rows: WeekRowData[] = [];
  if (res.ok) {
    const byUser = new Map(res.data.weeks.map((w) => [w.user_id, w]));
    rows = res.data.people.map((p) => {
      const w = byUser.get(p.id);
      return {
        userId: p.id,
        name: p.name,
        email: p.email,
        isSelf: p.id === adminId,
        weekId: w?.id ?? null,
        status: w?.status ?? null,
        total: w ? weekTotal(w.timesheet_rows) : 0,
      };
    });
    // Needs-a-decision first, then A-Z.
    rows.sort(
      (a, b) => Number(b.status === "submitted") - Number(a.status === "submitted") || a.name.localeCompare(b.name)
    );
  }
  const waiting = rows.filter((r) => r.status === "submitted").length;
  const hours = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <div className="ts-admin-bar">
        <h2 className="ts-h2b">Week of {formatYmd(weekStart, { day: "numeric", month: "short", year: "numeric" })}</h2>
        <nav className="ts-week-nav" aria-label="Choose week">
          <Link href={link(addDays(weekStart, -7))} className="ts-btn ts-btn-ghost ts-btn-sm">
            <span aria-hidden="true">←</span> Previous week
          </Link>
          <Link
            href={link()}
            className="ts-btn ts-btn-ghost ts-btn-sm"
            aria-current={weekStart === thisMonday ? "page" : undefined}
          >
            This week
          </Link>
          <Link href={link(addDays(weekStart, 7))} className="ts-btn ts-btn-ghost ts-btn-sm">
            Next week <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>

      {!res.ok ? (
        <LoadError message={res.error} retryHref={link(weekStart)} />
      ) : (
        <>
          <div className="ts-summary">
            <Stat id="a-emps" title="Employees">
              {res.data.people.length}
            </Stat>
            <Stat id="a-wait" title="Waiting for approval">
              {waiting}
            </Stat>
            <Stat id="a-hours" title="Hours logged this week">
              {fmt(hours)} h
            </Stat>
          </div>
          <section className="ts-card ts-flush" aria-label="Timesheets by employee">
            {rows.length === 0 ? (
              <p className="ts-muted ts-pad">There are no employees yet.</p>
            ) : (
              <WeeksTable rows={rows} weekStart={weekStart} />
            )}
          </section>
        </>
      )}
    </>
  );
}

// -------------------------------- Requests --------------------------------

export async function RequestsTab({ adminId, filterParam }: { adminId: string; filterParam?: string }) {
  const filter = filterParam === "all" ? "all" : "pending";
  const link = (f: "pending" | "all") => `${BASE}?tab=requests&filter=${f}`;

  const res = await load<{ requests: RequestWithPerson[]; leaves: LeaveCover[] }>(async () => {
    const requests = await listAllRequests(filter, 50);

    // Team cover: other people's approved leave on the same dates. Informational only.
    const pending = requests.filter((r) => r.status === "pending");
    let leaves: LeaveCover[] = [];
    if (pending.length > 0) {
      try {
        const from = pending.reduce((m, r) => (r.from_date < m ? r.from_date : m), pending[0].from_date);
        const to = pending.reduce((m, r) => (r.to_date > m ? r.to_date : m), pending[0].to_date);
        leaves = await listApprovedLeaveBetween(from, to);
      } catch {
        leaves = []; // never block the tab, or an approval, because of this note
      }
    }
    return { requests, leaves };
  });

  const rows: RequestRowData[] = res.ok
    ? res.data.requests.map((r) => ({
        id: r.id,
        name: displayName(r.owner),
        email: r.owner?.email ?? "",
        isSelf: r.user_id === adminId,
        type: r.type,
        from: r.from_date,
        to: r.to_date,
        reason: r.reason,
        status: r.status,
        alsoOff:
          r.status === "pending"
            ? [
                ...new Set(
                  res.data.leaves
                    .filter((l) => l.user_id !== r.user_id && l.from_date <= r.to_date && l.to_date >= r.from_date)
                    .map((l) => displayName(l.owner))
                ),
              ]
            : [],
      }))
    : [];

  return (
    <>
      <div className="ts-admin-bar">
        <h2 className="ts-h2b">Requests</h2>
        <nav className="ts-week-nav" aria-label="Filter requests">
          <Link
            href={link("pending")}
            className="ts-btn ts-btn-ghost ts-btn-sm"
            aria-current={filter === "pending" ? "page" : undefined}
          >
            Pending
          </Link>
          <Link
            href={link("all")}
            className="ts-btn ts-btn-ghost ts-btn-sm"
            aria-current={filter === "all" ? "page" : undefined}
          >
            All (latest 50)
          </Link>
        </nav>
      </div>

      {!res.ok ? (
        <LoadError message={res.error} retryHref={link(filter)} />
      ) : rows.length === 0 ? (
        <section className="ts-card">
          <p className="ts-muted">
            {filter === "pending" ? "No requests are waiting for a decision." : "There are no requests yet."}
          </p>
        </section>
      ) : (
        <section className="ts-card ts-flush" aria-label="Requests">
          <RequestsTable rows={rows} />
        </section>
      )}
    </>
  );
}

// -------------------------------- Work logs --------------------------------

export async function LogsTab({ dateParam }: { dateParam?: string }) {
  const today = todayInOffice();
  const date = isYmd(dateParam) ? dateParam : today;
  const link = (d?: string) => `${BASE}?tab=logs${d ? `&date=${d}` : ""}`;

  const res = await load<{ people: Employee[]; logs: WorkLogWithPerson[] }>(async () => {
    const [people, logs] = await Promise.all([listEmployees(), listAllLogs(date)]);
    return { people, logs };
  });

  const byUser = new Map<string, WorkLogWithPerson[]>();
  if (res.ok) {
    for (const l of res.data.logs) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
  }
  const people = res.ok ? res.data.people : [];
  const withEntries = people.filter((p) => byUser.has(p.id));
  const without = people.filter((p) => !byUser.has(p.id));

  return (
    <>
      <div className="ts-admin-bar">
        <h2 className="ts-h2b">{formatYmd(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
        <div className="ts-date-controls">
          <Link href={link(addDays(date, -1))} className="ts-btn ts-btn-ghost ts-btn-sm">
            <span aria-hidden="true">←</span> Previous day
          </Link>
          <form method="get" action={BASE} className="ts-date-form">
            <input type="hidden" name="tab" value="logs" />
            <label htmlFor="log-date" className="ts-sr-only">
              Choose a date
            </label>
            <input id="log-date" name="date" type="date" className="ts-input ts-date-input" defaultValue={date} required />
            <button type="submit" className="ts-btn ts-btn-sm">
              Go
            </button>
          </form>
          <Link
            href={link()}
            className="ts-btn ts-btn-ghost ts-btn-sm"
            aria-current={date === today ? "page" : undefined}
          >
            Today
          </Link>
          <Link href={link(addDays(date, 1))} className="ts-btn ts-btn-ghost ts-btn-sm">
            Next day <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {!res.ok ? (
        <LoadError message={res.error} retryHref={link(date)} />
      ) : (
        <>
          <p className="ts-logs-count" role="status">
            <strong>
              {withEntries.length} of {people.length}
            </strong>{" "}
            {people.length === 1 ? "employee" : "employees"} added a work log.
          </p>
          {withEntries.map((p) => {
            const entries = byUser.get(p.id) ?? [];
            const total = entries.reduce((s, e) => s + (e.hours ?? 0), 0);
            return (
              <section key={p.id} className="ts-card" aria-labelledby={`log-${p.id}`}>
                <div className="ts-log-day-head">
                  <h3 className="ts-h3" id={`log-${p.id}`}>
                    {p.name}
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
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {without.length > 0 && (
            <section className="ts-card" aria-labelledby="log-none">
              <h3 className="ts-h3" id="log-none">
                No entry yet
              </h3>
              <ul className="ts-none-list">
                {without.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </section>
          )}
          {people.length === 0 && (
            <section className="ts-card">
              <p className="ts-muted">There are no employees yet.</p>
            </section>
          )}
        </>
      )}
    </>
  );
}

// -------------------------------- Employees --------------------------------

export async function EmployeesTab({ adminId }: { adminId: string }) {
  const res = await load(() => listEmployees());

  if (!res.ok) return <LoadError message={res.error} retryHref={`${BASE}?tab=employees`} />;
  if (res.data.length === 0) {
    return (
      <section className="ts-card">
        <p className="ts-muted">There are no employees yet.</p>
      </section>
    );
  }
  return (
    <section className="ts-card ts-flush" aria-label="Employees">
      <EmployeesTable rows={res.data.map((p) => ({ ...p, isSelf: p.id === adminId }))} />
    </section>
  );
}
