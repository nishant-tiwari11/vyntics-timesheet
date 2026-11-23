import "server-only";
import { loadTeam } from "@/lib/access/team";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { logError } from "@/lib/timesheet/log";

// The small numbers on the menu items: what is waiting for you. Keyed by the menu item's address. Zero is left out. Each piece
// fails on its own, so a problem with one never hides the rest. Only ever about the signed-in person (or, for admins and
// managers, the things they can decide).
export async function loadNavCounts(): Promise<Record<string, number>> {
  const me = await getCurrentUser();
  if (!me) return {};
  const supabase = await createClient();
  const counts: Record<string, number> = {};

  const safely = async <T,>(what: string, task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (e) {
      logError(`nav counts: ${what}`, e);
      return null;
    }
  };

  const [admin, docs, expenses, team, mine] = await Promise.all([
    me.role === "admin" ? safely("admin", getAdminCounts) : null,
    me.role === "admin"
      ? safely("documents", async () => {
          const { count, error } = await supabase.from("employee_documents" as never).select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_current", true).is("deleted_at", null);
          if (error) throw error;
          return count ?? 0;
        })
      : null,
    me.role === "admin"
      ? safely("expenses", async () => {
          const { count, error } = await supabase.from("expense_claims" as never).select("id", { count: "exact", head: true }).eq("status", "pending");
          if (error) throw error;
          return count ?? 0;
        })
      : null,
    me.role === "manager" ? safely("team", loadTeam) : null,
    me.role !== "viewer"
      ? safely("my requests", async () => {
          const { count, error } = await supabase.from("requests").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("status", "pending");
          if (error) throw error;
          return count ?? 0;
        })
      : null,
  ]);

  const add = (href: string, n: number | null | undefined) => {
    if (n && n > 0) counts[href] = n;
  };
  if (admin) {
    add("/timesheet/admin/approvals", admin.requests + admin.compOff);
    add("/timesheet/admin/documents", docs); // documents waiting for review
  }
  add("/timesheet/payroll/expenses", expenses);
  if (team) add("/timesheet/team", team.members.reduce((n, m) => n + m.pendingLogs + m.pendingExpenses + m.openRequests, 0));
  add("/timesheet/leave", mine);
  return counts;
}
