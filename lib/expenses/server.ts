import "server-only";
import { db, requireAdmin, requireUser } from "@/lib/timesheet/auth";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError, assertDate, assertId, toError } from "@/lib/timesheet/errors";
import { displayName } from "@/lib/timesheet/people";
import type { ExpenseItem } from "@/lib/payroll/engine";
import { MAX_PAISE, toRupeeText } from "@/lib/payroll/money";
import { isMonthKey, monthContaining } from "@/lib/payroll/period";
import { getPayrollSettings } from "@/lib/payroll/server";
import {
  FILTER_STATUSES,
  claimCode,
  csvCell as cell,
  type AdminFilter,
  type CategoryRow,
  type ClaimEvent,
  type ClaimRow,
  type ExpenseStatus,
} from "./types";

// Expense claims. Employees work with their OWN claims (the person always comes from the session, and the database
// checks again with row level security). Approving, rejecting, moving claims between payroll runs and the categories
// are admin-only: each of those functions starts with requireAdmin() and ends in a database function that checks too.
// Every change is written to the audit trail by a trigger in the database, so nothing here has to remember to log it.

type ClaimDb = {
  id: string;
  claim_no: number;
  user_id: string;
  category_id: string;
  expense_date: string;
  description: string;
  claimed_paise: number;
  approved_paise: number | null;
  status: string;
  payroll_month: string | null;
  payroll_run_id: string | null;
  taxable: boolean;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  reimbursed_on: string | null;
};

const CLAIM_COLUMNS =
  "id, claim_no, user_id, category_id, expense_date, description, claimed_paise, approved_paise, status, payroll_month, payroll_run_id, taxable, decided_by, decided_at, decision_note, reimbursed_on";

type Person = { full_name: string | null; email: string };

function toClaim(r: ClaimDb, categories: Map<string, string>, people: Map<string, Person>): ClaimRow {
  const who = people.get(r.user_id);
  return {
    id: r.id,
    code: claimCode(r.claim_no),
    userId: r.user_id,
    employee: who ? displayName(who) : "Former employee",
    employeeEmail: who?.email ?? "",
    date: r.expense_date,
    categoryId: r.category_id,
    category: categories.get(r.category_id) ?? "Removed category",
    description: r.description,
    claimed: r.claimed_paise,
    approved: r.approved_paise,
    status: r.status as ExpenseStatus,
    payrollMonth: r.payroll_month,
    payrollRunId: r.payroll_run_id,
    taxable: r.taxable,
    decidedBy: r.decided_by ? displayName(people.get(r.decided_by) ?? null) : "",
    decidedAt: r.decided_at,
    decisionNote: r.decision_note ?? "",
    reimbursedOn: r.reimbursed_on,
  };
}

async function peopleById(ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await db();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  if (error) throw toError(error, "Couldn't load the people. Please try again.");
  return new Map(data.map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
}

// ---------------------------- Categories ----------------------------

export async function listCategories(includeDisabled = false): Promise<CategoryRow[]> {
  await requireUser();
  const supabase = await db();
  let q = supabase.from("expense_categories").select("id, name, limit_paise, taxable, enabled").order("name", { ascending: true });
  if (!includeDisabled) q = q.eq("enabled", true);
  const { data, error } = await q;
  if (error) throw toError(error, "Couldn't load the expense categories. Please try again.");
  return data.map((c) => ({ id: c.id, name: c.name, limit: c.limit_paise, taxable: c.taxable, enabled: c.enabled }));
}

export async function saveCategory(input: { id?: string; name: string; limit: number | null; taxable: boolean; enabled: boolean }): Promise<void> {
  await requireAdmin();
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 60) throw new TimesheetError("Enter a category name of up to 60 characters.");
  if (input.limit !== null && (!Number.isInteger(input.limit) || input.limit <= 0 || input.limit >= MAX_PAISE)) {
    throw new TimesheetError("Enter a limit greater than zero, or leave it empty for no limit.");
  }
  const supabase = await db();
  const row = { name, limit_paise: input.limit, taxable: !!input.taxable, enabled: !!input.enabled };
  const res = input.id
    ? await supabase.from("expense_categories").update(row).eq("id", assertId(input.id, "category"))
    : await supabase.from("expense_categories").insert(row);
  if (res.error) {
    if (res.error.code === "23505") throw new TimesheetError("There is already a category with that name.");
    throw toError(res.error, "Couldn't save the category. Please try again.");
  }
}

// ---------------------------- An employee's own claims ----------------------------

async function categoryNames(): Promise<Map<string, string>> {
  const supabase = await db();
  const { data, error } = await supabase.from("expense_categories").select("id, name");
  if (error) throw toError(error, "Couldn't load the expense categories. Please try again.");
  return new Map(data.map((c) => [c.id, c.name]));
}

export async function listMyClaims(): Promise<ClaimRow[]> {
  const me = await requireUser();
  const supabase = await db();
  const [claims, names] = await Promise.all([
    supabase.from("expense_claims").select(CLAIM_COLUMNS).eq("user_id", me.id).order("expense_date", { ascending: false }).order("claim_no", { ascending: false }).limit(500),
    categoryNames(),
  ]);
  if (claims.error) throw toError(claims.error, "Couldn't load your expenses. Please try again.");
  const people = await peopleById([me.id, ...claims.data.map((c) => c.decided_by).filter((x): x is string => !!x)]);
  return claims.data.map((c) => toClaim(c as ClaimDb, names, people));
}

export type ClaimInput = { id?: string; categoryId: string; date: string; description: string; amount: number; submit: boolean };

/** Save a draft (or a new claim), and submit it when asked. A claim can only be changed while it is still a draft. */
export async function saveMyClaim(input: ClaimInput): Promise<string> {
  const me = await requireUser();
  const categoryId = assertId(input.categoryId, "category");
  const date = assertDate(input.date, "expense date");
  if (date > todayInOffice()) throw new TimesheetError("The expense date can't be in the future.");
  const description = String(input.description ?? "").trim();
  if (!description || description.length > 300) throw new TimesheetError("Describe the expense in up to 300 characters.");
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount >= MAX_PAISE) throw new TimesheetError("Enter an amount greater than zero, like 450 or 450.50.");

  const supabase = await db();
  const { data: cat, error: catError } = await supabase.from("expense_categories").select("id, enabled").eq("id", categoryId).maybeSingle();
  if (catError) throw toError(catError, "Couldn't check the category. Please try again.");
  if (!cat || !cat.enabled) throw new TimesheetError("Choose one of the listed categories.");

  const status = input.submit ? "pending" : "draft";
  if (input.id) {
    const id = assertId(input.id, "expense");
    const { data, error } = await supabase
      .from("expense_claims")
      .update({ category_id: categoryId, expense_date: date, description, claimed_paise: input.amount, status })
      .eq("id", id)
      .eq("user_id", me.id)
      .eq("status", "draft")
      .select("id");
    if (error) throw toError(error, "Couldn't save the expense. Please try again.");
    if (!data?.length) throw new TimesheetError("Only a draft can be changed. This expense has already been submitted.");
    return id;
  }
  const { data, error } = await supabase
    .from("expense_claims")
    .insert({ user_id: me.id, category_id: categoryId, expense_date: date, description, claimed_paise: input.amount, status })
    .select("id")
    .single();
  if (error) throw toError(error, "Couldn't save the expense. Please try again.");
  return data.id;
}

export async function submitMyClaim(id: string): Promise<void> {
  assertId(id, "expense");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("expense_claims").update({ status: "pending" }).eq("id", id).eq("user_id", me.id).eq("status", "draft").select("id");
  if (error) throw toError(error, "Couldn't submit the expense. Please try again.");
  if (!data?.length) throw new TimesheetError("Only a draft can be submitted.");
}

export async function deleteMyClaim(id: string): Promise<void> {
  assertId(id, "expense");
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("expense_claims").delete().eq("id", id).eq("user_id", me.id).eq("status", "draft").select("id");
  if (error) throw toError(error, "Couldn't delete the expense. Please try again.");
  if (!data?.length) throw new TimesheetError("Only a draft can be deleted.");
}

/** The history of one claim (who did what and when). The database only shows it to the owner and to admins. */
export async function getClaimEvents(claimId: string): Promise<ClaimEvent[]> {
  assertId(claimId, "expense");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("expense_events").select("id, actor_id, action, detail, created_at").eq("claim_id", claimId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(100);
  if (error) throw toError(error, "Couldn't load the history. Please try again.");
  const people = await peopleById(data.map((e) => e.actor_id).filter((x): x is string => !!x));
  return data.map((e) => ({ id: e.id, actor: e.actor_id ? displayName(people.get(e.actor_id) ?? null) : "System", action: e.action, detail: e.detail ?? "", at: e.created_at }));
}

// ---------------------------- Admin: the list ----------------------------

export type ClaimQuery = { filter: AdminFilter; runId?: string | null; q?: string };

export async function listAllClaims(query: ClaimQuery, limit = 500): Promise<ClaimRow[]> {
  await requireAdmin();
  const supabase = await db();
  let q = supabase.from("expense_claims").select(CLAIM_COLUMNS).neq("status", "draft").order("expense_date", { ascending: false }).order("claim_no", { ascending: false }).limit(limit);
  const statuses = FILTER_STATUSES[query.filter];
  if (statuses) q = q.in("status", statuses);
  if (query.runId) q = q.eq("payroll_run_id", assertId(query.runId, "payroll run"));
  const [claims, names] = await Promise.all([q, categoryNames()]);
  if (claims.error) throw toError(claims.error, "Couldn't load the expenses. Please try again.");
  const people = await peopleById(claims.data.flatMap((c) => [c.user_id, ...(c.decided_by ? [c.decided_by] : [])]));
  let rows = claims.data.map((c) => toClaim(c as ClaimDb, names, people));
  const needle = (query.q ?? "").trim().toLowerCase();
  if (needle) {
    rows = rows.filter((r) => [r.code, r.employee, r.employeeEmail, r.category, r.description].some((t) => t.toLowerCase().includes(needle)));
  }
  return rows;
}

// ---------------------------- Admin: deciding ----------------------------

export type MonthChoice = { month: string; label: string; disabled: boolean; reason: string };

const shift = (month: string, by: number) => {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/** The pay months an expense can go in: last month to three months ahead, minus any whose payroll is already finalized. */
export async function approvalMonths(): Promise<{ months: MonthChoice[]; defaultMonth: string }> {
  await requireAdmin();
  const settings = await getPayrollSettings();
  const current = monthContaining(todayInOffice(), settings.cycleStartDay);
  const supabase = await db();
  const { data, error } = await supabase.from("payroll_runs").select("period_end, status").limit(200);
  if (error) throw toError(error, "Couldn't load the payroll runs. Please try again.");
  const closed = new Set(data.filter((r) => r.status === "finalized" || r.status === "paid").map((r) => r.period_end.slice(0, 7)));
  const label = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const months: MonthChoice[] = [];
  for (let by = -1; by <= 3; by++) {
    const month = shift(current, by);
    months.push({ month, label: label(month), disabled: closed.has(month), reason: closed.has(month) ? "payroll already finalized" : "" });
  }
  const defaultMonth = months.find((m) => !m.disabled && m.month >= current)?.month ?? months.find((m) => !m.disabled)?.month ?? current;
  return { months, defaultMonth };
}

export async function approveClaim(id: string, amount: number, month: string, note: string): Promise<"approved" | "added_to_payroll"> {
  assertId(id, "expense");
  if (!Number.isInteger(amount) || amount <= 0 || amount >= MAX_PAISE) throw new TimesheetError("Enter the amount to approve, like 450 or 450.50.");
  if (!isMonthKey(month)) throw new TimesheetError("Choose the payroll month.");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.rpc("expense_approve", { p_claim: id, p_amount: amount, p_month: month, p_note: String(note ?? "").slice(0, 300) });
  if (error) throw toError(error, "Couldn't approve the expense. Please try again.");
  return data === "added_to_payroll" ? "added_to_payroll" : "approved";
}

export async function rejectClaim(id: string, note: string): Promise<void> {
  assertId(id, "expense");
  const why = String(note ?? "").trim();
  if (why.length < 3 || why.length > 300) throw new TimesheetError("Write the reason for rejecting, from 3 to 300 characters.");
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.rpc("expense_reject", { p_claim: id, p_note: why });
  if (error) throw toError(error, "Couldn't reject the expense. Please try again.");
}

/** Take a claim out of a payroll run that isn't finalized. It goes back to Approved for the next month's run. */
export async function removeClaimFromRun(id: string): Promise<void> {
  assertId(id, "expense");
  await requireAdmin();
  const supabase = await db();
  const { error } = await supabase.rpc("expense_remove_from_run", { p_claim: id });
  if (error) throw toError(error, "Couldn't remove the expense from the payroll. Please try again.");
}

// ---------------------------- Payroll: what goes into a run ----------------------------

export type RunExpenses = {
  /** Each employee's claims in this run, as the payroll engine wants them. */
  byUser: Map<string, ExpenseItem[]>;
  /** Claims in the run that belong to nobody being paid in it (for a warning). */
  all: { userId: string; code: string }[];
};

/** The claims linked to a run: the ones added to payroll, plus (for a locked run) the reimbursed ones. */
export async function listRunExpenses(runId: string): Promise<RunExpenses> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const [claims, names] = await Promise.all([
    supabase
      .from("expense_claims")
      .select("id, claim_no, user_id, category_id, expense_date, description, approved_paise, taxable, status")
      .eq("payroll_run_id", runId)
      .in("status", ["added_to_payroll", "reimbursed"])
      .order("expense_date", { ascending: true })
      .order("claim_no", { ascending: true })
      .limit(5000),
    categoryNames().catch(() => new Map<string, string>()),
  ]);
  // Until supabase/step23_expenses.sql has been run there is no expenses table. Payroll must keep working exactly as
  // before in that case, so a missing table means "no expenses" rather than an error.
  if (claims.error && (claims.error.code === "42P01" || claims.error.code === "PGRST205")) return { byUser: new Map(), all: [] };
  if (claims.error) throw toError(claims.error, "Couldn't load the expenses for this payroll. Please try again.");
  const byUser = new Map<string, ExpenseItem[]>();
  for (const c of claims.data) {
    if (!c.approved_paise) continue; // only the approved amount is ever paid; a claim without one adds nothing
    const list = byUser.get(c.user_id) ?? [];
    list.push({
      claimId: c.id,
      claimCode: claimCode(c.claim_no),
      date: c.expense_date,
      category: names.get(c.category_id) ?? "Expense",
      description: c.description,
      amount: c.approved_paise,
      taxable: c.taxable,
    });
    byUser.set(c.user_id, list);
  }
  return { byUser, all: claims.data.map((c) => ({ userId: c.user_id, code: claimCode(c.claim_no) })) };
}

/** Link every approved claim waiting for a run's month to that run (called when a run is created). */
export async function syncRunExpenses(runId: string): Promise<number> {
  assertId(runId, "payroll run");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.rpc("expense_sync_run", { p_run: runId });
  if (error) throw toError(error, "Couldn't add the approved expenses to the payroll. Please try again.");
  return data ?? 0;
}

// ---------------------------- Admin: CSV export ----------------------------

export async function claimsCsv(query: ClaimQuery): Promise<string> {
  const rows = await listAllClaims(query, 5000);
  const head = ["Claim ID", "Employee", "Email", "Expense date", "Category", "Description", "Claimed", "Approved", "Status", "Payroll month", "Reimbursed on", "Decided by", "Decided at", "Note"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        r.employee,
        r.employeeEmail,
        r.date,
        r.category,
        r.description,
        toRupeeText(r.claimed),
        r.approved === null ? "" : toRupeeText(r.approved),
        r.status.replace(/_/g, " "),
        r.payrollMonth ?? "",
        r.reimbursedOn ?? "",
        r.decidedBy,
        r.decidedAt ? r.decidedAt.slice(0, 10) : "",
        r.decisionNote,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
