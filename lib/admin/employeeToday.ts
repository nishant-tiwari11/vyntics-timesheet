import "server-only";
import { listAllClaims } from "@/lib/expenses/server";
import { listPayrollHistory } from "@/lib/payroll/history";
import { payBreakdown } from "@/lib/payroll/breakdown";
import { createClient } from "@/lib/supabase/server";
import { memberBalances, type MemberBalances } from "@/lib/timesheet/approvals";
import { requireAdmin } from "@/lib/timesheet/auth";
import { addDays, isWeekend, todayInOffice } from "@/lib/timesheet/dates";
import { assertId } from "@/lib/timesheet/errors";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { logError } from "@/lib/timesheet/log";

// A quick look at one employee's day for the overview's orbit dialer: today's work log, leave and work from home, expenses, the
// latest payslip and documents. Admin only. Every piece fails on its own (null) so one problem never blanks the dialer.

export type TodayLog = { id: string; project: string; hours: number; start: string; end: string; text: string };

export type EmployeeToday = {
  today: string;
  /** Weekend or holiday: nobody is expected to log. */
  dayOff: boolean;
  workLog: { entries: TodayLog[]; hours: number; weekHours: number } | null;
  leave: { today: { type: "leave" | "wfh"; kind: string | null; part: string } | null; upcoming: { from: string; to: string; type: string } | null; pending: number; balances: MemberBalances | null } | null;
  expenses: { pending: number; pendingAmount: number; approvedAmount: number; latest: { code: string; category: string; amount: number; status: string } | null } | null;
  payroll: { month: string; net: number; bonus: number; expenses: number; status: string; currency: string } | null | undefined;
  documents: { status: "skipped" | "submitted" | "in_progress" | "not_started"; uploaded: number; pending: number; rejected: number; hasLetters: { offer: boolean; joining: boolean } } | null;
};

async function safely<T>(what: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (e) {
    logError(`employee today: ${what}`, e);
    return null;
  }
}

export async function loadEmployeeToday(userId: string): Promise<EmployeeToday> {
  assertId(userId, "employee");
  await requireAdmin();
  const supabase = await createClient();
  const today = todayInOffice();
  const weekFrom = addDays(today, -6);

  const [logs, requests, balances, claims, payslips, onboarding, docs, off, profile] = await Promise.all([
    safely("logs", async () => {
      const { data, error } = await supabase
        .from("work_logs")
        .select("id, log_date, project, hours, start_time, end_time, content, status")
        .eq("user_id", userId)
        .gte("log_date", weekFrom)
        .lte("log_date", today)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    }),
    safely("requests", async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("type, from_date, to_date, status, leave_kind, day_part")
        .eq("user_id", userId)
        .in("status", ["pending", "approved"])
        .gte("to_date", today)
        .order("from_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data;
    }),
    safely("balances", () => memberBalances(userId)),
    safely("claims", async () => (await listAllClaims({ filter: "all" })).filter((c) => c.userId === userId)),
    safely("payslip", async () => (await listPayrollHistory(userId, 1)).rows[0] ?? null),
    safely("onboarding", async () => {
      const { data, error } = await supabase.from("employee_onboarding" as never).select("submitted_at, degree_mode, has_experience").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data as unknown as { submitted_at: string | null; degree_mode: string | null; has_experience: boolean | null } | null;
    }),
    safely("documents", async () => {
      const { data, error } = await supabase.from("employee_documents" as never).select("category, status").eq("user_id", userId).eq("is_current", true).is("deleted_at", null).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as { category: string; status: string }[];
    }),
    safely("off day", () => offDatesBetween(today, today)),
    safely("profile", async () => {
      const { data, error } = await supabase.from("profiles").select("email").is("removed_at", null).eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    }),
  ]);

  const exempt = profile
    ? await safely("skipped", async () => {
        const { data, error } = await supabase.from("onboarding_exemptions" as never).select("email").eq("email", profile.email.toLowerCase()).maybeSingle();
        if (error) throw error;
        return !!data;
      })
    : null;

  const dayOff = isWeekend(today) || (off?.length ?? 0) > 0;
  const round = (n: number) => Math.round(n * 100) / 100;

  const todays = (logs ?? []).filter((l) => l.log_date === today && l.status !== "rejected");
  const workLog = logs
    ? {
        entries: todays.map((l) => ({ id: l.id, project: l.project ?? "", hours: l.hours ?? 0, start: l.start_time?.slice(0, 5) ?? "", end: l.end_time?.slice(0, 5) ?? "", text: l.content })),
        hours: round(todays.reduce((n, l) => n + (l.hours ?? 0), 0)),
        weekHours: round(logs.filter((l) => l.status !== "rejected").reduce((n, l) => n + (l.hours ?? 0), 0)),
      }
    : null;

  const leave = requests
    ? (() => {
        const approved = requests.filter((r) => r.status === "approved");
        const now = approved.find((r) => r.from_date <= today && r.to_date >= today);
        const next = approved.find((r) => r.from_date > today);
        return {
          today: now ? { type: now.type as "leave" | "wfh", kind: now.leave_kind, part: now.day_part } : null,
          upcoming: next ? { from: next.from_date, to: next.to_date, type: next.type } : null,
          pending: requests.filter((r) => r.status === "pending").length,
          balances,
        };
      })()
    : null;

  const sum = (statuses: string[], pick: (c: { claimed: number; approved: number | null }) => number) => (claims ?? []).filter((c) => statuses.includes(c.status)).reduce((n, c) => n + pick(c), 0);
  const expenses = claims
    ? (() => {
        const latest = claims[0];
        return {
          pending: claims.filter((c) => c.status === "pending").length,
          pendingAmount: sum(["pending"], (c) => c.claimed),
          approvedAmount: sum(["approved", "added_to_payroll"], (c) => c.approved ?? 0),
          latest: latest ? { code: latest.code, category: latest.category, amount: latest.approved ?? latest.claimed, status: latest.status } : null,
        };
      })()
    : null;

  const payroll =
    payslips === null
      ? undefined
      : payslips
        ? (() => {
            const b = payBreakdown(payslips.payslip);
            return { month: payslips.month, net: b.total, bonus: b.bonus, expenses: b.expenses, status: payslips.status, currency: payslips.currency };
          })()
        : null;

  const letter = (cat: string) => (docs ?? []).some((d) => d.category === cat && d.status !== "rejected");
  const submitted = !!onboarding?.submitted_at;
  const documents = docs
    ? {
        status: (submitted ? "submitted" : exempt ? "skipped" : onboarding && (onboarding.degree_mode || onboarding.has_experience !== null) ? "in_progress" : docs.length > 0 ? "in_progress" : "not_started") as NonNullable<EmployeeToday["documents"]>["status"],
        uploaded: docs.filter((d) => !["offer_letter", "appointment_letter"].includes(d.category)).length,
        pending: docs.filter((d) => d.status === "pending").length,
        rejected: docs.filter((d) => d.status === "rejected").length,
        hasLetters: { offer: letter("offer_letter"), joining: letter("appointment_letter") },
      }
    : null;

  return { today, dayOff, workLog, leave, expenses, payroll, documents };
}
