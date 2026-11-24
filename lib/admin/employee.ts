import "server-only";
import { loadAccess, type AccessRow } from "@/lib/access/server";
import { listAllClaims } from "@/lib/expenses/server";
import type { ClaimRow } from "@/lib/expenses/types";
import { listPayrollHistory, type HistoryRow } from "@/lib/payroll/history";
import { loadDutyDays } from "@/lib/timesheet/duty";
import type { DutyDay } from "@/lib/timesheet/dutyTypes";
import { listStructureHistory } from "@/lib/payroll/server";
import type { StructureRow } from "@/lib/payroll/types";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { monthRange, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, assertId } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// One person, seen the way an owner or HR sees them: who they are, what they logged, what leave they took, what they claimed
// and what they were paid. Admin only. Every piece fails on its own (null) so one problem never hides the rest.

export type EmployeeLog = { id: string; date: string; project: string; hours: number; status: string; content: string };
export type EmployeeRequest = { id: string; type: string; compOff: boolean; from: string; to: string; status: string; reason: string };

export type EmployeeView = {
  person: AccessRow & { userId: string };
  joinedOn: string | null;
  leftOn: string | null;
  today: string;
  monthHours: { approved: number; pending: number } | null;
  logs: EmployeeLog[] | null;
  leave: { requests: EmployeeRequest[]; daysThisYear: number } | null;
  expenses: ClaimRow[] | null;
  salary: StructureRow | null | undefined; // undefined = could not load
  payslips: HistoryRow[] | null;
  /** The last two weeks of duty next to the hours reported on the timesheet (null if it couldn't be read). */
  duty: DutyDay[] | null;
};

async function safely<T>(what: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    logError(`employee view: ${what}`, e);
    return null;
  }
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export async function loadEmployee(id: string): Promise<EmployeeView> {
  assertId(id, "employee");
  await requireAdmin();
  const access = await loadAccess();
  const person = access.rows.find((r) => r.userId === id);
  if (!person || !person.userId) throw new TimesheetError("That employee doesn't exist.");

  const supabase = await createClient();
  const today = todayInOffice();
  const month = monthRange(today);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yearEnd = `${today.slice(0, 4)}-12-31`;

  const [details, logs, monthLogs, requests, claims, structures, payslips, duty] = await Promise.all([
    safely("details", async () => {
      const { data, error } = await supabase.from("employee_details").select("joined_on, left_on").eq("user_id", id).maybeSingle();
      if (error) throw error;
      return data;
    }),
    safely("recent logs", async () => {
      const { data, error } = await supabase
        .from("work_logs")
        .select("id, log_date, project, hours, status, content")
        .eq("user_id", id)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    }),
    safely("month hours", async () => {
      const { data, error } = await supabase.from("work_logs").select("hours, status").eq("user_id", id).gte("log_date", month.start).lte("log_date", month.end).limit(5000);
      if (error) throw error;
      return data;
    }),
    safely("requests", async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("id, type, comp_off, from_date, to_date, status, reason")
        .eq("user_id", id)
        .order("from_date", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    }),
    safely("expenses", async () => (await listAllClaims({ filter: "all" })).filter((c) => c.userId === id)),
    safely("salary", () => listStructureHistory(id)),
    safely("payslips", async () => (await listPayrollHistory(id, 12)).rows),
    safely("duty", () => loadDutyDays(id, 14)),
  ]);

  const sum = (status: string[]) => (monthLogs ?? []).filter((l) => status.includes(l.status)).reduce((n, l) => n + (l.hours ?? 0), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  const thisYear = (requests ?? []).filter((r) => r.type !== "wfh" && r.status === "approved" && r.to_date >= yearStart && r.from_date <= yearEnd);

  return {
    person: person as EmployeeView["person"],
    joinedOn: details?.joined_on ?? person.joinedOn,
    leftOn: details?.left_on ?? null,
    today,
    monthHours: monthLogs ? { approved: round(sum(["approved"])), pending: round(sum(["pending"])) } : null,
    logs: logs
      ? logs.map((l) => ({ id: l.id, date: l.log_date, project: l.project ?? "", hours: l.hours ?? 0, status: l.status, content: l.content }))
      : null,
    leave: requests
      ? {
          requests: requests.slice(0, 8).map((r) => ({ id: r.id, type: r.type, compOff: r.comp_off, from: r.from_date, to: r.to_date, status: r.status, reason: r.reason ?? "" })),
          daysThisYear: thisYear.reduce((n, r) => n + daysBetween(r.from_date < yearStart ? yearStart : r.from_date, r.to_date > yearEnd ? yearEnd : r.to_date), 0),
        }
      : null,
    expenses: claims,
    salary: structures === null ? undefined : (structures.find((s) => s.effectiveFrom <= today) ?? null),
    payslips,
    duty,
  };
}
