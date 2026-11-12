import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { requestsByDay } from "@/lib/timesheet/compOff";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { logError } from "@/lib/timesheet/log";
import { listLogsInRange } from "@/lib/timesheet/logs";
import { displayName } from "@/lib/timesheet/people";
import { listRequests } from "@/lib/timesheet/requests";
import { eachDay, periodOf, type Period, type WorkQuery } from "./query";
import type { Entry } from "./model";

export type CompOffTag = { status: string; needsReapproval: boolean };

export type WorkLogData = {
  me: { id: string; admin: boolean };
  today: string;
  period: Period;
  /** Every entry in the period (everyone's for an admin), before the project / status / search filters. */
  entries: Entry[];
  /** More entries exist than were loaded. */
  truncated: boolean;
  offDays: string[];
  leaveDays: string[];
  /** Comp-off request per "userId|date". */
  compOff: Record<string, CompOffTag>;
};

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

async function load(query: WorkQuery): Promise<Loaded<WorkLogData>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const admin = user.role === "admin";
    const today = todayInOffice();
    const period = periodOf(query, today);

    const [logs, offDays, requests, compOff] = await Promise.all([
      listLogsInRange({ scope: admin ? "all" : "mine", from: period.from, to: period.to }),
      // Holidays, leave and comp-off are extras: if one can't load, the list still works without it.
      offDatesBetween(period.from, period.to).catch(() => [] as string[]),
      listRequests().catch(() => []),
      requestsByDay(period.from, period.to).catch(() => ({}) as Record<string, CompOffTag>),
    ]);

    const leaveDays = new Set<string>();
    for (const r of requests) {
      if (r.type !== "leave" || r.status !== "approved") continue;
      for (const d of eachDay(r.from_date < period.from ? period.from : r.from_date, r.to_date > period.to ? period.to : r.to_date)) {
        leaveDays.add(d);
      }
    }

    const entries: Entry[] = logs.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      person: displayName(r.owner),
      date: r.log_date,
      start: r.start_time?.slice(0, 5) ?? "",
      end: r.end_time?.slice(0, 5) ?? "",
      hours: r.hours,
      project: r.project ?? "",
      text: r.content,
      status: r.status,
      noCompOff: r.no_comp_off,
      reviewedAt: r.reviewed_at,
    }));

    return {
      ok: true,
      data: {
        me: { id: user.id, admin },
        today,
        period,
        entries,
        truncated: logs.total > logs.rows.length,
        offDays,
        leaveDays: [...leaveDays],
        compOff,
      },
    };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("work log", e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}

/** One load per request, shared by the summary cards, the list and the CSV export. The key is the query as text. */
const loadCached = cache((key: string) => load(JSON.parse(key) as WorkQuery));
export const loadWorkLog = (query: WorkQuery) => loadCached(JSON.stringify(query));
