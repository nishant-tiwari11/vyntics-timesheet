import Link from "next/link";
import { ArrowRight, CalendarCheck2, Palmtree } from "lucide-react";
import { UserAvatar } from "../../_components/UserAvatar";
import { loadPendingRequests, type PendingRequest } from "@/lib/timesheet/approvals";
import { listApprovedLeaveBetween, type LeaveCover } from "@/lib/timesheet/admin";
import { addDays, daysInclusive, formatRange, todayInOffice } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { RequestCard } from "./approvals/RequestCard";

const HORIZON_DAYS = 60;
const SHOWN_REQUESTS = 3;
const SHOWN_AWAY = 8;

async function safely<T>(what: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    logError(`admin overview leave: ${what}`, e);
    return null;
  }
}

/** "Today", "Tomorrow", "In 5 days" for the day leave starts (or "Back on 14 Dec" is shown by the range itself). */
function startsIn(from: string, today: string): string {
  const days = from <= today ? 0 : daysInclusive(today, from) - 1;
  return days === 0 ? "On leave now" : days === 1 ? "Starts tomorrow" : `Starts in ${days} days`;
}

// Leave on the Admin overview, in two parts side by side: who is waiting for a decision (each request is the same card as on the
// Approvals page, with the same Approve / Reject, and what each choice does to their paid leave and comp-off), and who will be away
// in the next two months. Deciding here changes both at once.
export async function LeaveSection() {
  const today = todayInOffice();
  const [pending, away] = await Promise.all([
    safely("requests", loadPendingRequests),
    safely("away", () => listApprovedLeaveBetween(today, addDays(today, HORIZON_DAYS))),
  ]);
  const waiting: PendingRequest[] = (pending?.rows ?? []).filter((r) => r.type === "leave");
  const wfh = (pending?.rows ?? []).length - waiting.length;
  const list: LeaveCover[] = [...(away ?? [])].sort((a, b) => a.from_date.localeCompare(b.from_date) || a.to_date.localeCompare(b.to_date));
  const now = list.filter((l) => l.from_date <= today);

  return (
    <section aria-label="Leave" className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Palmtree className="size-4" aria-hidden="true" /> Leave requests
            {waiting.length > 0 && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                {waiting.length}
                <span className="sr-only"> waiting for you</span>
              </span>
            )}
          </h2>
          <Link href="/timesheet/admin/approvals" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
            All approvals <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {pending === null ? (
          <p role="alert" className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the leave requests. Try reloading the page.
          </p>
        ) : waiting.length === 0 ? (
          <div className="grid justify-items-center gap-1 rounded-xl border border-dashed px-4 py-8 text-center">
            <strong className="text-sm">No leave requests waiting</strong>
            <p className="max-w-sm text-sm text-muted-foreground">When someone applies for leave it appears here, so you can approve or decline it straight away.</p>
            {wfh > 0 && (
              <Link href="/timesheet/admin/approvals" className="mt-1 text-sm font-medium underline underline-offset-4">
                {wfh} work from home {wfh === 1 ? "request is" : "requests are"} waiting
              </Link>
            )}
          </div>
        ) : (
          <>
            <ul className="grid gap-3" aria-label="Leave requests waiting for a decision">
              {waiting.slice(0, SHOWN_REQUESTS).map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </ul>
            {(waiting.length > SHOWN_REQUESTS || wfh > 0) && (
              <Link href="/timesheet/admin/approvals" className="w-fit text-sm font-medium underline underline-offset-4">
                {waiting.length > SHOWN_REQUESTS ? `${waiting.length - SHOWN_REQUESTS} more leave ${waiting.length - SHOWN_REQUESTS === 1 ? "request" : "requests"}` : ""}
                {waiting.length > SHOWN_REQUESTS && wfh > 0 ? " and " : ""}
                {wfh > 0 ? `${wfh} work from home` : ""} waiting in Approvals
              </Link>
            )}
          </>
        )}
      </div>

      <aside className="grid min-w-0 content-start gap-3 rounded-xl border bg-card p-4" aria-labelledby="away-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="away-title" className="flex items-center gap-2 text-base font-semibold">
            <CalendarCheck2 className="size-4" aria-hidden="true" /> Who will be away
          </h2>
          <span className="text-xs text-muted-foreground">Next {HORIZON_DAYS} days</span>
        </div>

        {away === null ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Couldn&apos;t load approved leave.
          </p>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nobody has approved leave in the next {HORIZON_DAYS} days.</p>
        ) : (
          <ul className="grid gap-2">
            {list.slice(0, SHOWN_AWAY).map((l, i) => {
              const name = displayName(l.owner);
              const here = l.from_date <= today;
              return (
                <li key={`${l.user_id}-${l.from_date}-${i}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <UserAvatar userId={l.user_id} name={name} className="size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRange(l.from_date, l.to_date)} · {daysInclusive(l.from_date, l.to_date)} {daysInclusive(l.from_date, l.to_date) === 1 ? "day" : "days"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${here ? "border-foreground bg-foreground font-medium text-background" : "text-muted-foreground"}`}>{startsIn(l.from_date, today)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > SHOWN_AWAY && (
          <Link href="/timesheet/calendar" className="w-fit text-sm font-medium underline underline-offset-4">
            and {list.length - SHOWN_AWAY} more in the calendar
          </Link>
        )}
        {now.length > 0 && <p className="text-xs text-muted-foreground">{now.length} {now.length === 1 ? "person is" : "people are"} on leave today.</p>}
      </aside>
    </section>
  );
}
