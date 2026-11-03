import { logError } from "@/lib/timesheet/log";
import "../dashboard/dashboard.css"; // shared chips, tags, skeleton, buttons
import "./timesheet-page.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, formatYmd, isYmd, mondayOf, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { listRequests } from "@/lib/timesheet/requests";
import { getWeek } from "@/lib/timesheet/weeks";
import { DAY_KEYS, type Request, type WeekWithRows } from "@/lib/timesheet/types";
import TimesheetEditor, { type DayTag } from "./TimesheetEditor";

export const metadata = { title: "Weekly timesheet" };

const BASE = "/timesheet/timesheet";

function message(e: unknown) {
  if (!(e instanceof TimesheetError)) logError("timesheet page", e);
  return e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.week) ? sp.week[0] : sp.week;
  const today = todayInOffice();
  const thisMonday = mondayOf(today);

  let weekStart = thisMonday;
  if (raw && isYmd(raw)) {
    weekStart = mondayOf(raw);
    // A date that isn't a Monday is corrected to that week's Monday.
    if (weekStart !== raw) redirect(`${BASE}?week=${weekStart}`);
  }

  // Read-only: opening a week never creates it.
  let week: WeekWithRows | null = null;
  let weekError: string | null = null;
  try {
    week = await getWeek(weekStart);
  } catch (e) {
    weekError = message(e);
  }

  let requests: Request[] | null = null;
  try {
    requests = await listRequests();
  } catch {
    requests = null; // tags are optional; the page still works without them
  }

  const tags: (DayTag | null)[] | null = requests
    ? DAY_KEYS.map((_, i) => {
        const date = addDays(weekStart, i);
        const r = requests.find(
          (q) => (q.status === "pending" || q.status === "approved") && q.from_date <= date && date <= q.to_date
        );
        return r ? { type: r.type, pending: r.status === "pending" } : null;
      })
    : null;

  const rows = (week?.timesheet_rows ?? []).map((r) => ({
    id: r.id,
    project: r.project,
    days: DAY_KEYS.map((k) => r[k]),
  }));
  const status = week?.status ?? "draft";
  const signature = JSON.stringify([week?.id ?? null, status, rows]);

  const prev = `${BASE}?week=${addDays(weekStart, -7)}`;
  const next = `${BASE}?week=${addDays(weekStart, 7)}`;
  const isThisWeek = weekStart === thisMonday;

  return (
    <div className="ts-sheet-page">
      <header className="ts-sheet-head">
        <h1 className="ts-h1">Week of {formatYmd(weekStart, { day: "numeric", month: "short", year: "numeric" })}</h1>
        <nav className="ts-week-nav" aria-label="Choose week">
          <Link href={prev} className="ts-btn ts-btn-ghost ts-btn-sm">
            <span aria-hidden="true">←</span> Previous week
          </Link>
          <Link
            href={BASE}
            className="ts-btn ts-btn-ghost ts-btn-sm"
            aria-current={isThisWeek ? "page" : undefined}
          >
            This week
          </Link>
          <Link href={next} className="ts-btn ts-btn-ghost ts-btn-sm">
            Next week <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </header>

      {weekError ? (
        <section className="ts-card">
          <p className="ts-alert" role="alert">
            {weekError}
          </p>
          <Link href={`${BASE}?week=${weekStart}`} className="ts-btn ts-btn-sm">
            Try again
          </Link>
        </section>
      ) : (
        <TimesheetEditor
          key={weekStart}
          weekStart={weekStart}
          today={today}
          thisMonday={thisMonday}
          weekId={week?.id ?? null}
          status={status}
          rows={rows}
          tags={tags}
          signature={signature}
        />
      )}
    </div>
  );
}
