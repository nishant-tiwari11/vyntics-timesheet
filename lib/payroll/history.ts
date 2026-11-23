import "server-only";
import { db, requireAdmin } from "@/lib/timesheet/auth";
import { assertId, toError } from "@/lib/timesheet/errors";
import { displayName } from "@/lib/timesheet/people";
import type { Payslip } from "./engine";
import { monthKeyOf } from "./period";
import { audit } from "./server";
import type { StoredSnapshot } from "./runs";

// Payroll history for admins: every stored (finalized or paid) payslip, for one employee or for everyone, newest first.
// Reads the snapshots, so a figure here is exactly what was paid, whatever the settings say now.

export type HistoryRow = {
  id: string;
  runId: string;
  userId: string;
  name: string;
  department: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  status: "finalized" | "paid";
  paidOn: string | null;
  currency: string;
  payslip: Payslip;
};

export type PersonOption = { id: string; name: string };

export async function listPayrollHistory(userId: string | null, limit = 240): Promise<{ rows: HistoryRow[]; people: PersonOption[] }> {
  if (userId) assertId(userId, "employee");
  await requireAdmin();
  const supabase = await db();

  let query = supabase
    .from("payslips")
    .select("id, run_id, user_id, period_start, period_end, status, paid_on, currency, snapshot")
    .is("superseded_at", null)
    .order("period_start", { ascending: false })
    .limit(limit);
  if (userId) query = query.eq("user_id", userId);

  const [slips, people] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email").order("full_name", { ascending: true }),
    audit("viewed", "payroll_history", userId ?? undefined, userId ? "Opened one employee's payroll history" : "Opened the payroll history"),
  ]);
  if (slips.error) throw toError(slips.error, "Couldn't load the payroll history. Please try again.");
  if (people.error) throw toError(people.error, "Couldn't load the payroll history. Please try again.");

  const rows = slips.data.map((s): HistoryRow => {
    const snap = s.snapshot as unknown as StoredSnapshot;
    return {
      id: s.id,
      runId: s.run_id,
      userId: s.user_id,
      name: snap.employee.name,
      department: snap.employee.department,
      month: monthKeyOf(s.period_end),
      periodStart: s.period_start,
      periodEnd: s.period_end,
      status: s.status as "finalized" | "paid",
      paidOn: s.paid_on,
      currency: s.currency,
      // Payslips stored before expenses existed have no reimbursement fields.
      payslip: { ...snap.payslip, reimbursement: snap.payslip.reimbursement ?? 0, expenses: snap.payslip.expenses ?? [] },
    };
  });
  return { rows, people: people.data.map((p) => ({ id: p.id, name: displayName(p) })) };
}
