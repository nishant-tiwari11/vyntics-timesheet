import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { formatYmd } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { categoryLabel } from "@/lib/documents/config";
import { WINDOW, dayBounds, humanize, mergeAudit, pageOf, type AuditEvent, type AuditQuery, type EventSource } from "./auditModel";

// The audit log reads the portal's existing records; nothing new is written or stored. Admin only: requireAdmin() first, and
// row-level security on every one of these tables lets only an admin read them. A record that doesn't exist yet (the step that
// creates it hasn't been run) or can't be read is simply left out, and the rest of the log still shows.

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export type AuditPage = { rows: AuditEvent[]; page: number; pages: number; total: number; /** Some record had more than we read: the oldest events may be missing. */ capped: boolean };

export async function loadAuditLog(q: AuditQuery): Promise<AuditPage> {
  await requireAdmin();
  const supabase = await createClient();
  const { start, end } = dayBounds(q.from, q.to);
  const want = (s: EventSource) => q.source === "all" || q.source === s;
  let capped = false;

  async function read(what: string, task: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
    try {
      const { data, error } = await task();
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      if (rows.length >= WINDOW) capped = true;
      return rows;
    } catch (e) {
      logError(`audit log: ${what}`, e);
      return [];
    }
  }

  // People's names, looked up once for every record.
  const people = new Map<string, string>();
  try {
    const { data } = await supabase.from("profiles").select("id, full_name, email").limit(5000);
    for (const p of data ?? []) people.set(p.id, displayName(p));
  } catch (e) {
    logError("audit log: people", e);
  }
  const who = (id: unknown) => people.get(str(id)) ?? (id ? "Former employee" : "System");

  const lists = await Promise.all([
    // ---- Users & access: roles, adding and removing people, passwords ----
    want("users")
      ? read("access", () =>
          supabase.from("access_audit" as never).select("id, actor_email, action, target, detail, created_at").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(WINDOW)
        ).then((rows): AuditEvent[] =>
          rows.map((r) => ({ key: `users:${r.id}`, at: str(r.created_at), source: "users", actor: str(r.actor_email) || "System", action: humanize(str(r.action)), target: str(r.target), detail: str(r.detail) }))
        )
      : [],

    // ---- Documents: upload, view, download, verify, delete ----
    want("documents")
      ? read("documents", () =>
          supabase.from("document_audit" as never).select("id, document_id, owner_id, actor_email, action, detail, at").gte("at", start).lte("at", end).order("at", { ascending: false }).limit(WINDOW)
        ).then(async (rows): Promise<AuditEvent[]> => {
          const ids = [...new Set(rows.map((r) => str(r.document_id)))];
          const docs = new Map<string, string>();
          if (ids.length > 0) {
            const { data } = await supabase.from("employee_documents" as never).select("id, name, category").in("id", ids);
            for (const d of (data ?? []) as unknown as Row[]) docs.set(str(d.id), `${str(d.name)} (${categoryLabel(str(d.category))})`);
          }
          return rows.map((r) => ({
            key: `documents:${r.id}`,
            at: str(r.at),
            source: "documents",
            actor: str(r.actor_email) || "System",
            action: `Document ${str(r.action)}`,
            target: `${docs.get(str(r.document_id)) ?? "A deleted document"}${r.owner_id ? `, ${who(r.owner_id)}` : ""}`,
            detail: str(r.detail),
          }));
        })
      : [],

    // ---- Expenses: submitted, approved, rejected, reimbursed ----
    want("expenses")
      ? read("expenses", () =>
          supabase.from("expense_events" as never).select("id, claim_id, actor_id, action, detail, created_at").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(WINDOW)
        ).then(async (rows): Promise<AuditEvent[]> => {
          const ids = [...new Set(rows.map((r) => str(r.claim_id)))];
          const claims = new Map<string, string>();
          if (ids.length > 0) {
            const { data } = await supabase.from("expense_claims" as never).select("id, claim_no, user_id").in("id", ids);
            for (const c of (data ?? []) as unknown as Row[]) claims.set(str(c.id), `EXP-${String(c.claim_no ?? "").padStart(5, "0")}, ${who(c.user_id)}`);
          }
          return rows.map((r) => ({
            key: `expenses:${r.id}`,
            at: str(r.created_at),
            source: "expenses",
            actor: who(r.actor_id),
            action: `Expense ${humanize(str(r.action)).toLowerCase()}`,
            target: claims.get(str(r.claim_id)) ?? "A deleted claim",
            detail: str(r.detail),
          }));
        })
      : [],

    // ---- Payroll: who looked at or changed what (the notes never hold salary figures) ----
    want("payroll")
      ? read("payroll", () =>
          supabase.from("payroll_audit" as never).select("id, actor_id, action, entity, entity_id, detail, created_at").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(WINDOW)
        ).then((rows): AuditEvent[] =>
          rows.map((r) => ({ key: `payroll:${r.id}`, at: str(r.created_at), source: "payroll", actor: who(r.actor_id), action: humanize(str(r.action)), target: humanize(str(r.entity)), detail: str(r.detail) }))
        )
      : [],

    // ---- Approvals: leave and work from home, time logs, comp-off (who decided, and when) ----
    want("approvals") ? approvals() : [],
  ]);

  async function approvals(): Promise<AuditEvent[]> {
    const [requests, logs, compOff] = await Promise.all([
      read("requests", () =>
        supabase.from("requests").select("id, user_id, type, comp_off, status, from_date, to_date, reviewed_by, reviewed_at").not("reviewed_at", "is", null).gte("reviewed_at", start).lte("reviewed_at", end).order("reviewed_at", { ascending: false }).limit(WINDOW)
      ),
      read("time logs", () =>
        supabase.from("work_logs").select("id, user_id, project, log_date, hours, status, reviewed_by, reviewed_at").not("reviewed_at", "is", null).gte("reviewed_at", start).lte("reviewed_at", end).order("reviewed_at", { ascending: false }).limit(WINDOW)
      ),
      read("comp-off", () =>
        supabase.from("comp_off_requests").select("id, user_id, work_date, status, approved_by, approved_at").not("approved_at", "is", null).gte("approved_at", start).lte("approved_at", end).order("approved_at", { ascending: false }).limit(WINDOW)
      ),
    ]);
    const events: AuditEvent[] = [];
    for (const r of requests) {
      const kind = r.comp_off ? "Comp-off leave" : str(r.type) === "wfh" ? "Work from home" : "Leave";
      events.push({
        key: `approvals:request:${r.id}`,
        at: str(r.reviewed_at),
        source: "approvals",
        actor: who(r.reviewed_by),
        action: `${kind} ${str(r.status)}`,
        target: who(r.user_id),
        detail: `${formatYmd(str(r.from_date), { day: "numeric", month: "short" })}${r.to_date !== r.from_date ? ` to ${formatYmd(str(r.to_date), { day: "numeric", month: "short" })}` : ""}`,
      });
    }
    for (const l of logs) {
      events.push({
        key: `approvals:log:${l.id}`,
        at: str(l.reviewed_at),
        source: "approvals",
        actor: who(l.reviewed_by),
        action: `Time log ${str(l.status)}`,
        target: who(l.user_id),
        detail: `${str(l.project) || "Entry"} on ${formatYmd(str(l.log_date), { day: "numeric", month: "short" })}${typeof l.hours === "number" ? `, ${Math.round(l.hours * 100) / 100} h` : ""}`,
      });
    }
    for (const c of compOff) {
      events.push({
        key: `approvals:compoff:${c.id}`,
        at: str(c.approved_at),
        source: "approvals",
        actor: who(c.approved_by),
        action: `Comp-off ${str(c.status)}`,
        target: who(c.user_id),
        detail: `Worked on ${formatYmd(str(c.work_date), { day: "numeric", month: "short" })}`,
      });
    }
    return events;
  }

  const merged = mergeAudit(lists, { q: q.q });
  return { ...pageOf(merged, q.page), capped };
}
