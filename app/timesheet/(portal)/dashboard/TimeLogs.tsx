import Link from "next/link";
import { requestsByDay } from "@/lib/timesheet/compOff";
import { formatYmd, isWeekend, todayInOffice } from "@/lib/timesheet/dates";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { LOCKED_MESSAGE, isLocked } from "@/lib/timesheet/rules";
import { displayName } from "@/lib/timesheet/people";
import DecideLogButtons from "./DecideLogButtons";
import DeleteLogButton from "./DeleteLogButton";
import { AdminRowActions } from "../admin/AdminLogControls";
import { EditLogButton } from "./LogDialog";
import { LogFilters, PageSize } from "./LogControls";
import { loadLogPage } from "./data";
import { logHref, type LogQuery } from "./logQuery";
import { SectionError } from "./sections";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** "14:30:00" → "2:30 PM" */
function clock(time: string | null): string {
  if (!time) return "—";
  const h = Number(time.slice(0, 2));
  const m = time.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

const STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;

/** 1 … 4 5 [6] 7 8 … 20 */
function pageList(current: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, current - 1, current, current + 1]);
  const pages = [...keep].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export default async function TimeLogs({
  isAdmin,
  myId,
  query,
}: {
  isAdmin: boolean;
  myId: string;
  query: LogQuery;
}) {
  const scope = isAdmin ? "all" : "mine";
  let page = query.page;
  let res = await loadLogPage(scope, query);
  // A page number past the end (e.g. after deleting entries): show the last page instead.
  if (res.ok && res.data.rows.length === 0 && res.data.total > 0 && page > 1) {
    page = Math.ceil(res.data.total / query.size);
    res = await loadLogPage(scope, { ...query, page });
  }

  // Which of these days were a week off or a holiday, and what became of the comp-off for them.
  // If this can't load, the table still works without the tags.
  const days = res.ok ? res.data.rows.map((r) => r.log_date).sort() : [];
  const [offList, coffByDay] = days.length
    ? await Promise.all([
        offDatesBetween(days[0], days[days.length - 1]).catch(() => [] as string[]),
        requestsByDay(days[0], days[days.length - 1]).catch(() => ({}) as Awaited<ReturnType<typeof requestsByDay>>),
      ])
    : [[] as string[], {} as Awaited<ReturnType<typeof requestsByDay>>];
  const holidaySet = new Set(offList);

  const today = todayInOffice();
  const title = isAdmin ? "All employee time logs" : "Your time logs";
  const total = res.ok ? res.data.total : 0;
  const last = Math.max(Math.ceil(total / query.size), 1);
  const from = total === 0 ? 0 : (page - 1) * query.size + 1;
  const to = res.ok ? from + res.data.rows.length - (total === 0 ? 0 : 1) : 0;
  const filtered = query.q !== "" || query.status !== "all" || query.range !== "all";

  return (
    <section className="ts-section" id="logs" aria-labelledby="logs-title">
      <div className="ts-section-head">
        <h2 className="ts-h2s" id="logs-title">
          {title}
          {query.q && (
            <span className="ts-search-note">
              matching “{query.q}”{" "}
              <Link href={logHref(query, { q: "", page: 1 })} className="ts-link">
                Clear search
              </Link>
            </span>
          )}
        </h2>
        <LogFilters query={query} />
      </div>

      {!res.ok ? (
        <div className="ts-card">
          <SectionError message={res.error} />
          <Link href={logHref(query, { page })} className="ts-btn ts-btn-sm">
            Try again
          </Link>
        </div>
      ) : res.data.rows.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>{filtered ? "No entries match these filters" : "No time logs yet"}</strong>
          <p>
            {filtered
              ? "Try a wider time range or clear the search."
              : "At the end of the day, use Add time log to record what you worked on."}
          </p>
          {filtered && (
            <Link href="/timesheet/dashboard#logs" className="ts-btn ts-btn-ghost ts-btn-sm">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <div className="ts-card ts-flush">
          <div className="ts-table-wrap" tabIndex={0} role="region" aria-label={`${title}, scrolls sideways`}>
            <table className="ts-table ts-logs-table">
              <caption className="ts-sr-only">{title}, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">{isAdmin ? "Employee" : "Date"}</th>
                  <th scope="col">Start time</th>
                  <th scope="col">End time</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Project</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="ts-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data.rows.map((row) => {
                  const who = displayName(row.owner);
                  const date =
                    row.log_date === today
                      ? "Today"
                      : formatYmd(row.log_date, { day: "numeric", month: "short", year: "numeric" });
                  const own = row.user_id === myId;
                  const worked = isWeekend(row.log_date) ? "Worked on week-off" : holidaySet.has(row.log_date) ? "Worked on holiday" : null;
                  const coff = worked ? coffByDay[`${row.user_id}|${row.log_date}`] : undefined;
                  const tag = worked && (
                    <span className="ts-worked">
                      <span className="ts-hol ts-hol-optional">{worked}</span>
                      {coff && (
                        <span className="ts-muted ts-small">
                          Comp-off: {coff.needsReapproval ? "re-approval needed" : coff.status === "pending" ? "Pending" : coff.status === "approved" ? "Approved" : "Rejected"}
                        </span>
                      )}
                    </span>
                  );
                  return (
                    <tr key={row.id}>
                      <td data-label={isAdmin ? "Employee" : "Date"} className="ts-nowrap">
                        {isAdmin ? (
                          <span className="ts-person">
                            <span className="ts-avatar ts-avatar-sm" aria-hidden="true">
                              {who.charAt(0).toUpperCase()}
                            </span>
                            <span className="ts-person-text">
                              {who}
                              <span className="ts-person-date">{date}</span>
                            </span>
                          </span>
                        ) : (
                          date
                        )}
                        {tag}
                      </td>
                      <td data-label="Start time" className="ts-nowrap">
                        {clock(row.start_time)}
                      </td>
                      <td data-label="End time" className="ts-nowrap">
                        {clock(row.end_time)}
                      </td>
                      <td data-label="Duration" className="ts-nowrap">
                        {row.hours != null ? `${fmt(row.hours)} ${row.hours === 1 ? "hour" : "hours"}` : "—"}
                      </td>
                      <td data-label="Project" className="ts-nowrap">
                        {row.project ?? "—"}
                      </td>
                      <td data-label="Notes" className="ts-notes">
                        {/* React escapes this text; pre-wrap keeps line breaks from the entry. */}
                        {row.content}
                      </td>
                      <td data-label="Status">
                        <span className={`ts-pill ts-pill-${row.status}`}>{STATUS[row.status]}</span>
                      </td>
                      <td className="ts-actions">
                        {isAdmin && !own && row.status === "pending" && <DecideLogButtons id={row.id} who={who} />}
                        {isAdmin && (
                          <AdminRowActions
                            ownerName={who}
                            today={today}
                            entry={{
                              id: row.id,
                              date: row.log_date,
                              start: row.start_time?.slice(0, 5) ?? "",
                              end: row.end_time?.slice(0, 5) ?? "",
                              project: row.project ?? "",
                              text: row.content,
                            }}
                          />
                        )}
                        {!isAdmin && own && row.status === "pending" && isLocked(row.log_date, today) && (
                          <span className="ts-muted ts-small" title={LOCKED_MESSAGE}>
                            Locked
                          </span>
                        )}
                        {!isAdmin && own && row.status === "pending" && !isLocked(row.log_date, today) && (
                          <span className="ts-decide">
                            <EditLogButton
                              today={today}
                              entry={{
                                id: row.id,
                                date: row.log_date,
                                start: row.start_time?.slice(0, 5) ?? "",
                                end: row.end_time?.slice(0, 5) ?? "",
                                project: row.project ?? "",
                                text: row.content,
                                noCompOff: row.no_comp_off,
                              }}
                            />
                            <DeleteLogButton id={row.id} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ts-pager">
            <div className="ts-pager-left">
              <PageSize query={{ ...query, page }} />
              <p className="ts-pager-info" role="status">
                {from}–{to} of {total}
              </p>
            </div>
            {last > 1 && (
              <nav className="ts-pager-nav" aria-label="Pages">
                {page > 1 ? (
                  <Link href={logHref(query, { page: page - 1 })} className="ts-btn ts-btn-ghost ts-btn-sm" rel="prev">
                    Previous
                  </Link>
                ) : (
                  <span className="ts-btn ts-btn-ghost ts-btn-sm is-disabled" aria-disabled="true">
                    Previous
                  </span>
                )}
                {pageList(page, last).map((n, i) =>
                  n === "gap" ? (
                    <span key={`gap-${i}`} className="ts-pager-gap" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={logHref(query, { page: n })}
                      className="ts-page-btn"
                      aria-current={n === page ? "page" : undefined}
                      aria-label={`Page ${n}`}
                    >
                      {n}
                    </Link>
                  )
                )}
                {page < last ? (
                  <Link href={logHref(query, { page: page + 1 })} className="ts-btn ts-btn-ghost ts-btn-sm" rel="next">
                    Next
                  </Link>
                ) : (
                  <span className="ts-btn ts-btn-ghost ts-btn-sm is-disabled" aria-disabled="true">
                    Next
                  </span>
                )}
              </nav>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
