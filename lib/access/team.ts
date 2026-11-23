import "server-only";
import { db, requireUser } from "@/lib/timesheet/auth";
import { addDays, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, toError } from "@/lib/timesheet/errors";
import { displayName } from "@/lib/timesheet/people";
import { ROLE_LABEL, toRole, type Role } from "./config";

// The Team page: a manager sees their direct reports, an admin sees everyone. It only READS, and only through the
// signed-in person's own session, so the database's rules (a manager can read just their reports' records) apply on top
// of the check here. Nobody else can open it.

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  /** Hours logged in the last 7 days (today and the 6 days before). */
  hoursThisWeek: number;
  /** Comp-off credit requests waiting for a decision. */
  pendingCompOff: number;
  pendingExpenses: number;
  openRequests: number;
};

export async function loadTeam(): Promise<{ members: TeamMember[]; scope: "team" | "everyone"; needsSetup: boolean }> {
  const me = await requireUser();
  if (me.role !== "manager" && me.role !== "admin") throw new TimesheetError("Only managers and admins can see a team.");
  const supabase = await db();

  const base = supabase.from("profiles").select("id, full_name, email, role, manager_id").neq("id", me.id).order("full_name", { ascending: true }).limit(2000);
  const people = await (me.role === "admin" ? base : base.eq("manager_id", me.id));
  if (people.error) {
    if (people.error.code === "42703") return { members: [], scope: "team", needsSetup: true };
    throw toError(people.error, "Couldn't load your team. Please try again.");
  }
  const ids = people.data.map((p) => p.id);
  if (ids.length === 0) return { members: [], scope: me.role === "admin" ? "everyone" : "team", needsSetup: false };

  const today = todayInOffice();
  const from = addDays(today, -6);
  const [logs, expenses, requests, compOff] = await Promise.all([
    supabase.from("work_logs").select("user_id, hours, status, log_date").in("user_id", ids).gte("log_date", from).lte("log_date", today).limit(20000),
    supabase.from("expense_claims").select("user_id").in("user_id", ids).eq("status", "pending").limit(5000),
    supabase.from("requests").select("user_id").in("user_id", ids).eq("status", "pending").limit(5000),
    supabase.from("comp_off_requests").select("user_id").in("user_id", ids).eq("status", "pending").limit(5000),
  ]);
  for (const r of [logs, requests]) if (r.error) throw toError(r.error, "Couldn't load your team. Please try again.");
  // Expenses exist only after step 23; before that the count is simply zero.
  const expenseRows = expenses.error ? [] : expenses.data;

  const hours = new Map<string, number>();
  for (const l of logs.data!) {
    if (l.status !== "rejected") hours.set(l.user_id, (hours.get(l.user_id) ?? 0) + (l.hours ?? 0));
  }
  const count = (rows: { user_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const exp = count(expenseRows);
  const req = count(requests.data!);
  const comp = count(compOff.error ? [] : compOff.data);

  const members = people.data.map((p) => {
    const role = toRole(p.role) ?? "employee";
    return {
      id: p.id,
      name: displayName(p),
      email: p.email,
      role,
      roleLabel: ROLE_LABEL[role],
      hoursThisWeek: Math.round((hours.get(p.id) ?? 0) * 100) / 100,
      pendingCompOff: comp.get(p.id) ?? 0,
      pendingExpenses: exp.get(p.id) ?? 0,
      openRequests: req.get(p.id) ?? 0,
    };
  });
  return { members, scope: me.role === "admin" ? "everyone" : "team", needsSetup: false };
}
