import "server-only";
import { listAllClaims } from "@/lib/expenses/server";
import { listRuns, type RunSummary } from "@/lib/payroll/runs";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { addDays, isWeekend, mondayOf, todayInOffice } from "@/lib/timesheet/dates";
import { offDatesBetween, upcomingHolidays } from "@/lib/timesheet/holidays";
import type { Holiday } from "@/lib/timesheet/holidayTypes";
import { logError } from "@/lib/timesheet/log";
import { listLogsInRange } from "@/lib/timesheet/logs";
import { displayName } from "@/lib/timesheet/people";
import { countBy, weekHours, type CountRow } from "./companyModel";
import { notLoggedToday } from "./overviewModel";

// The company picture on the Admin overview: people, today, this week's hours, payroll, expenses and holidays. Admin only.
// Every piece is fetched at the same time and fails on its own (null), so one problem never takes the page down.

export type Person = { id: string; name: string };

export type CompanyOverview = {
  today: string;
  headcount: {
    total: number;
    roles: CountRow[];
    departments: CountRow[];
    newJoiners: { id: string; name: string; joinedOn: string }[];
  } | null;
  now: { dayOff: "weekly off" | "holiday" | null; present: number; notLogged: number | null; onLeave: Person[]; wfh: Person[] } | null;
  week: { days: { date: string; hours: number }[]; total: number; projects: CountRow[] } | null;
  payroll: { latest: RunSummary | null; open: number } | null;
  expenses: { pending: number; pendingAmount: number; approvedAmount: number; reimbursedAmount: number } | null;
  holidays: Holiday[] | null;
  /** Everyone who is active, for the badge rail on the overview. */
  people: { id: string; name: string; email: string; role: string; joinedOn: string }[] | null;
};

async function safely<T>(what: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    logError(`company overview: ${what}`, e);
    return null;
  }
}

type Owner = { full_name: string | null; email: string } | null;

export async function loadCompanyOverview(): Promise<CompanyOverview> {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayInOffice();
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [people, details, requests, logs, runs, claims, holidays, off] = await Promise.all([
    safely("people", async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, role, status, created_at").limit(5000);
      if (error) throw error;
      return data as { id: string; full_name: string | null; email: string; role: string; status?: string; created_at: string }[];
    }),
    safely("details", async () => {
      const { data, error } = await supabase.from("employee_details").select("user_id, department, joined_on, left_on").limit(5000);
      if (error) throw error;
      return data;
    }),
    safely("requests today", async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("user_id, type, comp_off, owner:profiles!requests_user_id_fkey(full_name, email)")
        .eq("status", "approved")
        .lte("from_date", today)
        .gte("to_date", today)
        .limit(2000);
      if (error) throw error;
      return data as unknown as { user_id: string; type: string; comp_off: boolean; owner: Owner }[];
    }),
    safely("hours", () => listLogsInRange({ scope: "all", from: monday, to: addDays(monday, 6) })),
    safely("payroll", listRuns),
    safely("expenses", () => listAllClaims({ filter: "all" })),
    safely("holidays", () => upcomingHolidays(today, 4)),
    safely("off day", () => offDatesBetween(today, today)),
  ]);

  const active = (people ?? []).filter((p) => p.status !== "disabled" && p.role !== "viewer");
  const detailBy = new Map((details ?? []).map((d) => [d.user_id, d]));
  const thisMonth = today.slice(0, 7);

  const headcount: CompanyOverview["headcount"] = people
    ? {
        total: active.length,
        roles: countBy(
          people.filter((p) => p.status !== "disabled").map((p) => p.role.charAt(0).toUpperCase() + p.role.slice(1)),
          "Employee",
          4,
        ),
        departments: countBy(active.map((p) => detailBy.get(p.id)?.department ?? "")),
        newJoiners: active
          .map((p) => ({ id: p.id, name: displayName(p), joinedOn: detailBy.get(p.id)?.joined_on ?? p.created_at.slice(0, 10) }))
          .filter((p) => p.joinedOn >= addDays(today, -30))
          .sort((a, b) => b.joinedOn.localeCompare(a.joinedOn))
          .slice(0, 4),
      }
    : null;

  let now: CompanyOverview["now"] = null;
  if (people && requests && logs) {
    const hoursToday = new Map<string, number>();
    for (const l of logs.rows.filter((r) => r.log_date === today && r.status !== "rejected")) {
      hoursToday.set(l.user_id, (hoursToday.get(l.user_id) ?? 0) + (l.hours ?? 0));
    }
    const leave = requests.filter((r) => r.type !== "wfh");
    const dayOff = isWeekend(today) ? "weekly off" : off && off.length > 0 ? "holiday" : null;
    now = {
      dayOff,
      present: active.filter((p) => (hoursToday.get(p.id) ?? 0) > 0).length,
      notLogged: notLoggedToday({ people, hoursById: hoursToday, onLeave: new Set(leave.map((r) => r.user_id)), dayOff: dayOff !== null }),
      onLeave: leave.map((r) => ({ id: r.user_id, name: displayName(r.owner) })),
      wfh: requests.filter((r) => r.type === "wfh").map((r) => ({ id: r.user_id, name: displayName(r.owner) })),
    };
  }

  const week = logs
    ? weekHours(
        logs.rows.map((l) => ({ date: l.log_date, project: l.project ?? "", hours: l.hours ?? 0, status: l.status })),
        days,
      )
    : null;

  const sum = (statuses: string[], pick: (c: { claimed: number; approved: number | null }) => number, monthOnly = false) =>
    (claims ?? [])
      .filter((c) => statuses.includes(c.status) && (!monthOnly || (c.reimbursedOn ?? "").startsWith(thisMonth)))
      .reduce((n, c) => n + pick(c), 0);

  return {
    today,
    headcount,
    now,
    week: week ? { days: week.perDay, total: week.total, projects: week.projects } : null,
    payroll: runs ? { latest: runs[0] ?? null, open: runs.filter((r) => r.status === "draft" || r.status === "reviewed").length } : null,
    expenses: claims
      ? {
          pending: claims.filter((c) => c.status === "pending").length,
          pendingAmount: sum(["pending"], (c) => c.claimed),
          approvedAmount: sum(["approved", "added_to_payroll"], (c) => c.approved ?? 0),
          reimbursedAmount: sum(["reimbursed"], (c) => c.approved ?? 0, true),
        }
      : null,
    holidays,
    people: people
      ? active
          .map((p) => ({ id: p.id, name: displayName(p), email: p.email, role: p.role, joinedOn: detailBy.get(p.id)?.joined_on ?? p.created_at.slice(0, 10) }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 24)
      : null,
  };
}
