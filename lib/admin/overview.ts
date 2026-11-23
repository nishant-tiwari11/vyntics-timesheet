import "server-only";
import { categoryLabel } from "@/lib/documents/config";
import { formatMoney } from "@/lib/payroll/money";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { listAll as listPendingCompOff } from "@/lib/timesheet/compOff";
import { formatRange, formatYmd, isWeekend, todayInOffice } from "@/lib/timesheet/dates";
import { listApprovedLeaveBetween } from "@/lib/timesheet/admin";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { logError } from "@/lib/timesheet/log";
import { listAllLogs } from "@/lib/timesheet/logs";
import { displayName } from "@/lib/timesheet/people";
import { notLoggedToday, sortAttention, type AttentionItem } from "./overviewModel";

// Everything the Admin overview shows, in one load. Admin only (requireAdmin first). Each piece is fetched at the same time and
// fails on its own: if one can't load, its card shows a dash and the rest of the page still works.

export type AdminOverview = {
  employees: number | null;
  pendingRequests: number | null;
  pendingExpenses: number | null;
  /** How many people have logged nothing today. null on a weekly off or a holiday (nobody is expected to log). */
  notLogged: number | null;
  dayOff: "weekly off" | "holiday" | null;
  /** Everything waiting on an admin, longest-waiting first (at most `LIMIT`). */
  attention: AttentionItem[];
  /** How many things wait in total (the list shows only the first few). */
  waitingTotal: number;
};

const LIMIT = 10;
const PER_KIND = 8;

async function safely<T>(what: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (e) {
    logError(`admin overview: ${what}`, e);
    return fallback;
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function loadAdminOverview(): Promise<AdminOverview> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const today = todayInOffice();

  const [people, requests, compOff, expenses, documents, activity] = await Promise.all([
    safely(
      "people",
      async () => {
        const { data, error } = await supabase.from("profiles").select("id, full_name, email, role, status").limit(5000);
        if (error) throw error;
        return data as { id: string; full_name: string | null; email: string; role: string; status?: string }[];
      },
      null
    ),
    safely(
      "requests",
      async () => {
        const { data, error, count } = await supabase
          .from("requests")
          .select("*, owner:profiles!requests_user_id_fkey(full_name, email)", { count: "exact" })
          .eq("status", "pending")
          .neq("user_id", me.id)
          .order("created_at", { ascending: true })
          .limit(PER_KIND);
        if (error) throw error;
        return { rows: data, total: count ?? data.length };
      },
      null
    ),
    safely("comp-off", async () => (await listPendingCompOff("pending")).filter((r) => r.userId !== me.id), null),
    safely(
      "expenses",
      async () => {
        const { data, error, count } = await supabase
          .from("expense_claims" as never)
          .select("id, user_id, claim_no, description, claimed_paise, created_at", { count: "exact" })
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(PER_KIND);
        if (error) throw error;
        return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
      },
      null
    ),
    safely(
      "documents",
      async () => {
        const { data, error, count } = await supabase
          .from("employee_documents" as never)
          .select("id, user_id, name, category, created_at", { count: "exact" })
          .eq("status", "pending")
          .eq("is_current", true)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(PER_KIND);
        if (error) throw error;
        return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
      },
      null
    ),
    safely(
      "today",
      async () => {
        const [todaysLogs, leave, off] = await Promise.all([
          listAllLogs(today),
          listApprovedLeaveBetween(today, today),
          offDatesBetween(today, today).catch(() => [] as string[]),
        ]);
        const hours = new Map<string, number>();
        for (const l of todaysLogs.filter((l) => l.status !== "rejected")) hours.set(l.user_id, (hours.get(l.user_id) ?? 0) + (l.hours ?? 0));
        return { hours, onLeave: new Set(leave.map((l) => l.user_id)), holiday: off.length > 0 };
      },
      null
    ),
  ]);

  const names = new Map((people ?? []).map((p) => [p.id, displayName(p)]));
  const nameOf = (id: string) => names.get(id) ?? "Former employee";
  const items: AttentionItem[] = [];

  for (const r of requests?.rows ?? []) {
    const type = str(r.type);
    const label = (r as { comp_off?: boolean }).comp_off ? "Comp-off leave" : type === "wfh" ? "Work from home" : "Leave";
    items.push({
      id: str(r.id),
      kind: "request",
      userId: str(r.user_id),
      who: displayName((r as { owner?: { full_name: string | null; email: string } | null }).owner),
      title: label,
      detail: formatRange(str(r.from_date), str(r.to_date)),
      at: str(r.created_at),
      inline: false, // leave needs the admin to choose paid, comp-off or unpaid, so it is decided on the Approvals page
      href: "/timesheet/admin/approvals",
    });
  }
  for (const c of compOff ?? []) {
    items.push({
      id: c.id,
      kind: "compoff",
      userId: c.userId,
      who: c.name,
      title: c.needsReapproval ? "Comp-off (changed)" : "Comp-off",
      detail: `${formatYmd(c.workDate, { day: "numeric", month: "short" })} · ${Math.round(c.hours * 100) / 100} h worked`,
      at: c.createdAt,
      inline: true,
      href: "/timesheet/admin/approvals?view=compoff",
    });
  }
  for (const e of expenses?.rows ?? []) {
    items.push({
      id: str(e.id),
      kind: "expense",
      userId: str(e.user_id),
      who: nameOf(str(e.user_id)),
      title: "Expense claim",
      detail: `EXP-${String(e.claim_no ?? "").padStart(5, "0")} · ${str(e.description).slice(0, 40)} · ${formatMoney(Number(e.claimed_paise) || 0)}`,
      at: str(e.created_at),
      inline: false,
      href: "/timesheet/payroll/expenses",
    });
  }
  for (const d of documents?.rows ?? []) {
    items.push({
      id: str(d.id),
      kind: "document",
      userId: str(d.user_id),
      who: nameOf(str(d.user_id)),
      title: "Document to verify",
      detail: `${str(d.name)} (${categoryLabel(str(d.category))})`,
      at: str(d.created_at),
      inline: false,
      href: "/timesheet/admin/documents",
    });
  }

  const dayOff = isWeekend(today) ? "weekly off" : activity?.holiday ? "holiday" : null;
  const notLogged =
    people && activity ? notLoggedToday({ people, hoursById: activity.hours, onLeave: activity.onLeave, dayOff: dayOff !== null }) : null;

  return {
    employees: people ? people.filter((p) => p.role !== "viewer" && p.status !== "disabled").length : null,
    pendingRequests: requests ? requests.total : null,
    pendingExpenses: expenses ? expenses.total : null,
    notLogged,
    dayOff,
    attention: sortAttention(items, LIMIT),
    waitingTotal: (requests?.total ?? 0) + (compOff?.length ?? 0) + (expenses?.total ?? 0) + (documents?.total ?? 0),
  };
}
