import "server-only";
import { memberBalances, type MemberBalances } from "@/lib/timesheet/approvals";
import { db, requireApprover } from "@/lib/timesheet/auth";
import { addDays, monthRange, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, assertId } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";

// One person on a manager's team: their work logs, leave and work from home, and balances. Read only, through the signed-in
// person's own session, so the database only returns people who report to them (admins can open anyone).

export type MemberLog = { id: string; date: string; project: string; hours: number; text: string; status: string };
export type MemberRequest = { id: string; type: string; from: string; to: string; part: string; kind: string | null; status: string; reason: string; note: string };

export type TeamMemberView = {
  id: string;
  name: string;
  email: string;
  monthHours: number;
  weekHours: number;
  logs: MemberLog[] | null;
  requests: MemberRequest[] | null;
  balances: MemberBalances | null;
};

async function safely<T>(what: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    logError(`team member: ${what}`, e);
    return null;
  }
}

export async function loadTeamMember(id: string): Promise<TeamMemberView> {
  assertId(id, "person");
  const me = await requireApprover();
  const supabase = await db();
  const { data: profile, error } = await supabase.from("profiles").select("id, full_name, email, manager_id").is("removed_at", null).eq("id", id).maybeSingle();
  if (error || !profile) throw new TimesheetError("That person isn't on your team.");
  if (me.role !== "admin" && profile.manager_id !== me.id) throw new TimesheetError("That person isn't on your team.");

  const today = todayInOffice();
  const month = monthRange(today);
  const weekFrom = addDays(today, -6);

  const [logs, monthLogs, requests, balances] = await Promise.all([
    safely("logs", async () => {
      const { data, error: e } = await supabase.from("work_logs").select("id, log_date, project, hours, content, status").eq("user_id", id).order("log_date", { ascending: false }).order("created_at", { ascending: false }).limit(30);
      if (e) throw e;
      return data;
    }),
    safely("hours", async () => {
      const { data, error: e } = await supabase.from("work_logs").select("log_date, hours, status").eq("user_id", id).gte("log_date", month.start.slice(0, 10) < weekFrom ? month.start : weekFrom).lte("log_date", today).limit(5000);
      if (e) throw e;
      return data;
    }),
    safely("requests", async () => {
      const { data, error: e } = await supabase.from("requests").select("id, type, from_date, to_date, day_part, leave_kind, status, reason, admin_note").eq("user_id", id).order("from_date", { ascending: false }).limit(15);
      if (e) throw e;
      return data;
    }),
    safely("balances", () => memberBalances(id)),
  ]);

  const sum = (from: string) => Math.round((monthLogs ?? []).filter((l) => l.status !== "rejected" && l.log_date >= from).reduce((n, l) => n + (l.hours ?? 0), 0) * 100) / 100;

  return {
    id: profile.id,
    name: displayName(profile),
    email: profile.email,
    monthHours: sum(month.start),
    weekHours: sum(weekFrom),
    logs: logs ? logs.map((l) => ({ id: l.id, date: l.log_date, project: l.project ?? "", hours: l.hours ?? 0, text: l.content, status: l.status })) : null,
    requests: requests
      ? requests.map((r) => ({ id: r.id, type: r.type, from: r.from_date, to: r.to_date, part: r.day_part, kind: r.leave_kind, status: r.status, reason: r.reason ?? "", note: r.admin_note ?? "" }))
      : null,
    balances,
  };
}
