import "server-only";
import { readDocumentsBase } from "@/lib/documents/admin";
import { docRowFrom, listDocuments, type DocRow } from "@/lib/documents/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { requireAdmin } from "@/lib/timesheet/auth";
import { TimesheetError, assertId, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";
import { ACCOUNT_TYPES, checkBank, emptyAnswers, missingForSubmit, neededDocs, type AccountType, type Answers, type DegreeMode, type ExperienceType } from "./rules";

// Reading and saving onboarding answers. The employee only ever reads and writes their own (row-level security and the
// onboarding_save function enforce it); admins read everyone's. The account number is never logged.

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST202"]);

type Db = {
  user_id: string;
  degree_mode: string | null;
  bank_holder: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_confirmed: boolean;
  has_experience: boolean | null;
  experience_type: string | null;
  submitted_at: string | null;
  updated_at: string;
};
const COLUMNS = "user_id, degree_mode, bank_holder, bank_name, bank_account, bank_ifsc, bank_branch, bank_account_type, bank_confirmed, has_experience, experience_type, submitted_at, updated_at";

function answersFrom(r: Db | null): Answers {
  if (!r) return emptyAnswers();
  return {
    degreeMode: r.degree_mode === "degree" || r.degree_mode === "marksheets" ? (r.degree_mode as DegreeMode) : null,
    bank: {
      holder: r.bank_holder ?? "",
      bankName: r.bank_name ?? "",
      account: r.bank_account ?? "",
      ifsc: r.bank_ifsc ?? "",
      branch: r.bank_branch ?? "",
      type: ACCOUNT_TYPES.some((t) => t.id === r.bank_account_type) ? (r.bank_account_type as AccountType) : "",
      confirmed: r.bank_confirmed,
    },
    hasExperience: r.has_experience,
    experienceType: r.experience_type === "free_internship" || r.experience_type === "paid" ? (r.experience_type as ExperienceType) : null,
  };
}

/** Who has to onboard: employees and managers. Admins (the owner / HR) and read-only viewers don't. */
export const mustOnboard = (role: string) => role === "employee" || role === "manager";

export type OnboardingGate = { locked: boolean; rejected: number };

/**
 * Is the signed-in person held at the onboarding page, and do they have documents HR sent back? Cheap enough to run on every
 * page. Before step35_onboarding.sql has been run nobody is held, so the portal never locks everyone out by accident.
 */
// Someone who has been let through is not asked again for a minute on the same server, so moving between pages doesn't repeat
// the look-ups. Only a "let through" answer is kept (never "held"), so submitting onboarding takes effect at once.
const GATE_TTL_MS = 60_000;
const passed = new Map<string, { at: number; rejected: number }>();

export async function getOnboardingGate(): Promise<OnboardingGate> {
  const me = await getCurrentUser();
  if (!me || !mustOnboard(me.role)) return { locked: false, rejected: 0 };
  const known = passed.get(me.id);
  if (known && Date.now() - known.at < GATE_TTL_MS) return { locked: false, rejected: known.rejected };
  try {
    const supabase = await createClient();
    // All three look-ups are made together (the "skipped" check is only used if the person hasn't submitted).
    const [row, rejected, skipped] = await Promise.all([
      supabase.from("employee_onboarding" as never).select("submitted_at").eq("user_id", me.id).maybeSingle(),
      supabase.from("employee_documents" as never).select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("is_current", true).is("deleted_at", null).eq("status", "rejected"),
      supabase.rpc("onboarding_exempt" as never),
    ]);
    if (row.error) {
      if (!MISSING.has(row.error.code ?? "")) logError("onboarding gate", row.error);
      return { locked: false, rejected: 0 };
    }
    const submitted = (row.data as unknown as { submitted_at: string | null } | null)?.submitted_at ?? null;
    let locked = submitted === null;
    // An admin can skip onboarding for a person (kept by email). Before step38 the function doesn't exist: nobody is skipped.
    if (locked && !skipped.error && skipped.data === true) locked = false;
    const count = rejected.error ? 0 : (rejected.count ?? 0);
    if (!locked) {
      if (passed.size > 500) passed.clear();
      passed.set(me.id, { at: Date.now(), rejected: count });
    }
    return { locked, rejected: count };
  } catch (e) {
    logError("onboarding gate", e);
    return { locked: false, rejected: 0 };
  }
}

export type MyOnboarding = {
  ready: boolean;
  answers: Answers;
  submitted: boolean;
  submittedAt: string | null;
  /** Everything of theirs that is current: what they uploaded, and the letters HR issued. */
  docs: DocRow[];
};

export async function loadMyOnboarding(): Promise<MyOnboarding> {
  const me = await getCurrentUser();
  if (!me) throw new TimesheetError("Please sign in again.");
  const supabase = await createClient();
  const [row, docs] = await Promise.all([
    supabase.from("employee_onboarding" as never).select(COLUMNS).eq("user_id", me.id).maybeSingle(),
    listDocuments(me.id),
  ]);
  if (row.error && !MISSING.has(row.error.code ?? "")) throw toError(row.error, "Couldn't load your onboarding. Please try again.");
  const r = row.error ? null : (row.data as unknown as Db | null);
  return { ready: !row.error && docs.ready, answers: answersFrom(r), submitted: !!r?.submitted_at, submittedAt: r?.submitted_at ?? null, docs: docs.ready ? docs.current : [] };
}

export type SaveInput = { answers: Answers; accountAgain: string; submit: boolean };

/** Save the answers. With `submit`, everything must be complete (the files too), then the onboarding is locked. */
export async function saveMyOnboarding(input: SaveInput): Promise<void> {
  const me = await getCurrentUser();
  if (!me || !mustOnboard(me.role)) throw new TimesheetError("Onboarding is only for employees.");
  const a = input.answers;
  const supabase = await createClient();

  if (input.submit) {
    const docs = await listDocuments(me.id);
    const uploaded = new Set(docs.ready ? docs.current.filter((d) => d.status !== "rejected").map((d) => d.category) : []);
    const missing = missingForSubmit(a, uploaded, input.accountAgain);
    if (missing.length > 0) throw new TimesheetError(missing[0]);
  } else if (a.bank.account.trim() || a.bank.ifsc.trim()) {
    // A draft may be unfinished, but what is filled in must be well formed (the database refuses odd values).
    if (a.bank.account.trim() && !/^[0-9]{6,20}$/.test(a.bank.account.trim())) throw new TimesheetError("The account number should be 6 to 20 digits, with no spaces.");
    if (a.bank.ifsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(a.bank.ifsc.trim().toUpperCase())) throw new TimesheetError("The IFSC code looks wrong. It is 11 characters, like HDFC0001234.");
  }

  const { error } = await supabase.rpc("onboarding_save" as never, {
    p_degree_mode: a.degreeMode ?? "",
    p_holder: a.bank.holder,
    p_bank: a.bank.bankName,
    p_account: a.bank.account,
    p_ifsc: a.bank.ifsc,
    p_branch: a.bank.branch,
    p_type: a.bank.type,
    p_confirmed: a.bank.confirmed,
    p_has_exp: a.hasExperience,
    p_exp_type: a.hasExperience ? (a.experienceType ?? "") : "",
    p_submit: input.submit,
  } as never);
  if (error) throw toError(error, "Couldn't save. Please try again.");
}

// ---------------------------- Admin ----------------------------

export type OnboardingItem = { category: string; label: string; doc: DocRow | null };
export type OnboardingRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: "not_started" | "in_progress" | "submitted" | "skipped";
  submittedAt: string | null;
  answers: Answers;
  /** The files this person's answers call for, each with the document (if uploaded). */
  items: OnboardingItem[];
  letters: { offer: DocRow | null; joining: DocRow | null };
  bankComplete: boolean;
};

export type AdminOnboarding = { ready: boolean; rows: OnboardingRow[] };

export async function loadAdminOnboarding(): Promise<AdminOnboarding> {
  await requireAdmin();
  const supabase = await createClient();
  // People and documents are shared with the documents page (read once for both); only the answers and the skipped list are new.
  const [{ docsRes: docs, peopleRes: people }, rows, exempt] = await Promise.all([
    readDocumentsBase(),
    supabase.from("employee_onboarding" as never).select(COLUMNS).limit(5000),
    supabase.from("onboarding_exemptions" as never).select("email").limit(5000),
  ]);
  const skippedEmails = new Set(exempt.error ? [] : ((exempt.data ?? []) as unknown as { email: string }[]).map((x) => x.email));
  if (people.error) throw toError(people.error, "Couldn't load onboarding. Please try again.");
  if (rows.error) {
    if (MISSING.has(rows.error.code ?? "")) return { ready: false, rows: [] };
    throw toError(rows.error, "Couldn't load onboarding. Please try again.");
  }
  if (docs.error) throw toError(docs.error, "Couldn't load onboarding. Please try again.");

  const peopleRows = (people.data ?? []) as unknown as { id: string; full_name: string | null; email: string; role: string; status: string }[];
  const names = new Map(peopleRows.map((p) => [p.id, displayName(p)]));
  const answers = new Map((rows.data as unknown as Db[]).map((r) => [r.user_id, r]));
  const docsBy = new Map<string, DocRow[]>();
  for (const d of (docs.data ?? []) as unknown as Parameters<typeof docRowFrom>[0][]) {
    const row = docRowFrom(d, names);
    docsBy.set(row.userId, [...(docsBy.get(row.userId) ?? []), row]);
  }

  const out = peopleRows
    .filter((p) => p.status !== "disabled" && mustOnboard(p.role))
    .map((p) => {
      const r = answers.get(p.id) ?? null;
      const a = answersFrom(r);
      const mine = docsBy.get(p.id) ?? [];
      const find = (cat: string) => mine.find((d) => d.category === cat) ?? null;
      const started = !!r && (r.degree_mode !== null || r.has_experience !== null || !!r.bank_account || mine.some((d) => d.category !== "offer_letter" && d.category !== "appointment_letter"));
      return {
        userId: p.id,
        name: displayName(p),
        email: p.email,
        role: p.role,
        status: (r?.submitted_at ? "submitted" : skippedEmails.has(p.email.toLowerCase()) ? "skipped" : started ? "in_progress" : "not_started") as OnboardingRow["status"],
        submittedAt: r?.submitted_at ?? null,
        answers: a,
        items: neededDocs(a).map((n) => ({ category: n.category, label: n.label, doc: find(n.category) })),
        letters: { offer: find("offer_letter"), joining: find("appointment_letter") },
        bankComplete: checkBank(a.bank) === null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ready: true, rows: out };
}

/** The full account number, for HR when they pay or verify. Admin only. */
export async function revealAccount(userId: string): Promise<string> {
  assertId(userId, "employee");
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_onboarding" as never).select("bank_account").eq("user_id", userId).maybeSingle();
  if (error) throw toError(error, "Couldn't load the bank details. Please try again.");
  return (data as unknown as { bank_account: string | null } | null)?.bank_account ?? "";
}

export async function reopenOnboarding(userId: string): Promise<void> {
  assertId(userId, "employee");
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_reopen" as never, { p_user: userId } as never);
  if (error) throw toError(error, "Couldn't reopen the onboarding. Please try again.");
}

/** Skip onboarding for a person (they use the portal straight away), or require it again. Admin only. */
export async function setOnboardingSkip(email: string, skip: boolean): Promise<void> {
  await requireAdmin();
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new TimesheetError("Enter a valid email address.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_skip" as never, { p_email: e, p_skip: skip === true } as never);
  if (error) throw toError(error, "Couldn't change onboarding for this person. Please try again.");
}
