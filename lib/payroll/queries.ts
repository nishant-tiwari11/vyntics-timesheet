import "server-only";
import { db, requireAdmin, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError, assertId, toError } from "@/lib/timesheet/errors";
import { displayName } from "@/lib/timesheet/people";
import { audit } from "./server";

// Payslip queries: an employee raises one on their own payslip, an admin answers and resolves it. In-app only.

export type QueryRow = {
  id: string;
  payslipId: string;
  month: string;
  topic: string;
  message: string;
  status: "open" | "resolved";
  reply: string;
  createdAt: string;
  resolvedAt: string | null;
  /** Filled for admins only. */
  name: string;
};

type Raw = {
  id: string;
  payslip_id: string;
  topic: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  resolved_at: string | null;
  payslip?: { period_end: string } | null;
  asker?: { full_name: string | null; email: string } | null;
};

const toRow = (r: Raw): QueryRow => ({
  id: r.id,
  payslipId: r.payslip_id,
  month: r.payslip?.period_end.slice(0, 7) ?? "",
  topic: r.topic,
  message: r.message,
  status: r.status === "resolved" ? "resolved" : "open",
  reply: r.admin_reply ?? "",
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  name: r.asker ? displayName(r.asker) : "",
});

/** Your own queries (the user id comes from the session, never from the request). */
export async function listMyQueries(): Promise<QueryRow[]> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("payroll_queries")
    .select("id, payslip_id, topic, message, status, admin_reply, created_at, resolved_at, payslip:payslips!payroll_queries_payslip_id_fkey(period_end)")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw toError(error, "Couldn't load your queries. Please try again.");
  return (data as unknown as Raw[]).map(toRow);
}

export async function raiseQuery(payslipId: string, topic: string, message: string): Promise<void> {
  assertId(payslipId, "payslip");
  const t = String(topic ?? "").trim();
  const m = String(message ?? "").trim();
  if (!t) throw new TimesheetError("Choose a topic.");
  if (t.length > 80) throw new TimesheetError("Keep the topic to 80 characters or fewer.");
  if (!m) throw new TimesheetError("Write your question.");
  if (m.length > 1000) throw new TimesheetError("Keep the message to 1000 characters or fewer.");

  const me = await requireUser();
  const supabase = await db();
  // The database checks the payslip is yours and still current; the user id is always your own.
  const { error } = await supabase.from("payroll_queries").insert({ user_id: me.id, payslip_id: payslipId, topic: t, message: m });
  if (error) {
    if (error.code === "42501") throw new TimesheetError("You can only raise a query about your own current payslip.");
    throw toError(error, "Couldn't send your query. Please try again.");
  }
}

// ---------------------------- Admin ----------------------------

export async function listAllQueries(filter: "open" | "all" = "open"): Promise<QueryRow[]> {
  await requireAdmin();
  const supabase = await db();
  let query = supabase
    .from("payroll_queries")
    .select(
      "id, payslip_id, topic, message, status, admin_reply, created_at, resolved_at, payslip:payslips!payroll_queries_payslip_id_fkey(period_end), asker:profiles!payroll_queries_user_id_fkey(full_name, email)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "open") query = query.eq("status", "open");
  const { data, error } = await query;
  if (error) throw toError(error, "Couldn't load the queries. Please try again.");
  await audit("viewed", "payroll_queries", undefined, "Opened the payslip queries");
  return (data as unknown as Raw[]).map(toRow);
}

export async function answerQuery(id: string, status: "open" | "resolved", reply: string): Promise<void> {
  assertId(id, "query");
  if (status !== "open" && status !== "resolved") throw new TimesheetError("Choose Open or Resolved.");
  const text = String(reply ?? "").trim();
  if (text.length > 1000) throw new TimesheetError("Keep the reply to 1000 characters or fewer.");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_queries").update({ status, admin_reply: text || null }).eq("id", id).select("id");
  if (error) throw toError(error, "Couldn't save the reply. Please try again.");
  if (!data?.length) throw new TimesheetError("That query no longer exists. Please refresh.");
  await audit("query_answered", "payroll_query", id, status === "resolved" ? "Resolved a payslip query" : "Replied to a payslip query");
}
