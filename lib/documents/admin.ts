import "server-only";
import { cache } from "react";
import { requiredChecklist } from "./config";
import { COLUMNS, docRowFrom, type Db, type DocRow } from "./server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { toError } from "@/lib/timesheet/errors";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/timesheet/people";

// Everything the HR documents page needs, in one load. Admin only: requireAdmin() first, and row-level security on
// the tables lets only an admin read other people's rows anyway.

export type AdminDoc = DocRow & { employeeName: string; employeeEmail: string };
export type EmployeeDocs = {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Managers only: may they see their team's ID, bank and salary documents? */
  canViewSensitive: boolean;
  done: number;
  total: number;
  /** Labels of the required categories with nothing uploaded. */
  missing: string[];
};
export type AuditRow = { id: number; at: string; actor: string; action: string; detail: string; document: string; employee: string };

export type AdminDocumentsData = { ready: false } | { ready: true; docs: AdminDoc[]; employees: EmployeeDocs[]; truncated: boolean };

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST202"]);
const LIMIT = 2000;

/**
 * The documents and the people, read once per request: the documents page and the onboarding list both need them, and asking twice
 * (up to 2,000 documents each time) was most of the wait. Admin only.
 */
export const readDocumentsBase = cache(async () => {
  await requireAdmin();
  const supabase = await createClient();
  const [docsRes, peopleRes] = await Promise.all([
    supabase.from("employee_documents" as never).select(COLUMNS).eq("is_current", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("profiles").select("id, full_name, email, role, status, can_view_sensitive_docs" as never).limit(5000),
  ]);
  return { docsRes, peopleRes };
});

export async function loadAdminDocuments(): Promise<AdminDocumentsData> {
  const { docsRes, peopleRes } = await readDocumentsBase();
  for (const r of [docsRes, peopleRes]) {
    if (r.error && MISSING.has(r.error.code ?? "")) return { ready: false };
    if (r.error) throw toError(r.error, "Couldn't load the documents. Please try again.");
  }

  const people = (peopleRes.data ?? []) as unknown as { id: string; full_name: string | null; email: string; role: string; status: string; can_view_sensitive_docs: boolean }[];
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = (docsRes.data ?? []) as unknown as Db[];

  const docs: AdminDoc[] = rows.map((r) => ({
    ...docRowFrom(r, names),
    employeeName: names.get(r.user_id) ?? "Former employee",
    employeeEmail: byId.get(r.user_id)?.email ?? "",
  }));

  const employees: EmployeeDocs[] = people
    .filter((p) => p.status !== "disabled")
    .map((p) => {
      const list = requiredChecklist(docs.filter((d) => d.userId === p.id).map((d) => ({ category: d.category, status: d.status })));
      return {
        id: p.id,
        name: displayName(p),
        email: p.email,
        role: p.role,
        canViewSensitive: !!p.can_view_sensitive_docs,
        done: list.done,
        total: list.total,
        missing: list.items.filter((i) => i.state === "missing" || i.state === "rejected").map((i) => i.category.label),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ready: true, docs, employees, truncated: rows.length >= LIMIT };
}

/** The latest 100 things done with documents. Only read when the Activity tab is opened. Admin only. */
export async function loadDocumentAudit(): Promise<AuditRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [auditRes, peopleRes] = await Promise.all([
    supabase.from("document_audit" as never).select("id, document_id, owner_id, actor_email, action, detail, at").order("at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, full_name, email").limit(5000),
  ]);
  if (auditRes.error) throw toError(auditRes.error, "Couldn't load the activity. Please try again.");
  const names = new Map((peopleRes.data ?? []).map((p) => [p.id, displayName(p)]));
  const events = (auditRes.data ?? []) as unknown as { id: number; document_id: string; owner_id: string | null; actor_email: string | null; action: string; detail: string | null; at: string }[];
  const docNames = new Map<string, string>();
  const ids = [...new Set(events.map((e) => e.document_id))];
  if (ids.length > 0) {
    const { data } = await supabase.from("employee_documents" as never).select("id, name").in("id", ids);
    for (const d of (data ?? []) as unknown as { id: string; name: string }[]) docNames.set(d.id, d.name);
  }
  return events.map((e) => ({
    id: e.id,
    at: e.at,
    actor: e.actor_email ?? "system",
    action: e.action,
    detail: e.detail ?? "",
    document: docNames.get(e.document_id) ?? "A deleted document",
    employee: e.owner_id ? (names.get(e.owner_id) ?? "") : "",
  }));
}
