// Employee documents: categories, limits and the small rules the server, the browser and the tests share.
// Plain code with no server-only imports. The database (supabase/step26_documents.sql) enforces the same lists.

import { isYmd } from "@/lib/timesheet/dates";

export const DOC_BUCKET = "documents";
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_EXPIRY_WARNING_DAYS = 30;

export type Category = {
  id: string;
  label: string;
  /** Shown under the name, e.g. what counts as an ID proof. */
  hint?: string;
  /** HR issues these (offer letter, joining letter): counted as "action required" until HR has uploaded one. */
  required: boolean;
  /** ID proof, bank and salary papers: hidden from managers unless an admin allows it. */
  sensitive: boolean;
  /** hr = issued by HR to the employee; onboarding = the employee submits it when joining; legacy = no longer offered, old files keep their label. */
  group: "hr" | "onboarding" | "legacy";
  /** What file types are accepted. Onboarding papers are PDFs; the passport photo is an image. */
  accept: "any" | "pdf" | "image";
};

export const CATEGORIES: readonly Category[] = [
  // Issued by HR (an admin uploads or generates them; the employee only downloads).
  { id: "offer_letter", label: "Offer Letter", required: true, sensitive: false, group: "hr", accept: "any" },
  { id: "appointment_letter", label: "Joining Letter", required: true, sensitive: false, group: "hr", accept: "any" },
  // Submitted by the employee during onboarding.
  { id: "degree", label: "Degree Certificate", hint: "PDF", required: false, sensitive: false, group: "onboarding", accept: "pdf" },
  { id: "marksheets", label: "Semester Marksheets", hint: "PDF, all semesters", required: false, sensitive: false, group: "onboarding", accept: "pdf" },
  { id: "aadhaar", label: "Aadhaar Card", hint: "PDF", required: false, sensitive: true, group: "onboarding", accept: "pdf" },
  { id: "passport_photo", label: "Passport-size Photo", hint: "JPG or PNG", required: false, sensitive: false, group: "onboarding", accept: "image" },
  { id: "prev_offer_letter", label: "Previous Company Offer Letter", hint: "PDF", required: false, sensitive: false, group: "onboarding", accept: "pdf" },
  { id: "prev_payslip", label: "Latest Payslip", hint: "PDF, from the previous company", required: false, sensitive: true, group: "onboarding", accept: "pdf" },
  { id: "other", label: "Other", required: false, sensitive: false, group: "hr", accept: "any" },
  // No longer asked for. Existing files keep their label and stay visible to HR.
  { id: "contract_nda", label: "Employment Contract / NDA", required: false, sensitive: false, group: "legacy", accept: "any" },
  { id: "id_proof", label: "ID Proof", hint: "Aadhaar, PAN, Passport or Driving License", required: false, sensitive: true, group: "legacy", accept: "any" },
  { id: "address_proof", label: "Address Proof", required: false, sensitive: false, group: "legacy", accept: "any" },
  { id: "education", label: "Education Certificates", required: false, sensitive: false, group: "legacy", accept: "any" },
  { id: "previous_employment", label: "Previous Employment", required: false, sensitive: false, group: "legacy", accept: "any" },
  { id: "bank_details", label: "Bank Details", hint: "Cancelled cheque or passbook", required: false, sensitive: true, group: "legacy", accept: "any" },
  { id: "salary_slips", label: "Salary Slips / Form 16", required: false, sensitive: true, group: "legacy", accept: "any" },
];

export const GROUP_LABEL: Record<Category["group"], string> = { hr: "Issued by HR", onboarding: "Submitted by the employee", legacy: "Older categories" };
/** What can be chosen when adding a document today (everything except the old categories). */
export const OFFERED_CATEGORIES = CATEGORIES.filter((c) => c.group !== "legacy");

export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id);
export const categoryLabel = (id: string) => categoryOf(id)?.label ?? "Other";
export const REQUIRED_CATEGORIES = CATEGORIES.filter((c) => c.required);

export type DocStatus = "pending" | "verified" | "rejected";
export const STATUS_LABEL: Record<DocStatus, string> = { pending: "Pending review", verified: "Verified", rejected: "Rejected" };
export type Visibility = "employee" | "hr_only";

export type DocKind = "pdf" | "doc" | "docx" | "jpeg" | "png";
export const KIND_MIME: Record<DocKind, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  png: "image/png",
};
const EXT_KIND: Record<string, DocKind> = { pdf: "pdf", doc: "doc", docx: "docx", jpg: "jpeg", jpeg: "jpeg", png: "png" };
export const ACCEPT_ATTR = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

export const extensionOf = (filename: string) => (filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "");
/** The kind a file NAME claims to be (the server also checks the real contents). */
export const kindFromName = (filename: string): DocKind | null => EXT_KIND[extensionOf(filename)] ?? null;
/** Does this kind of file suit the category (PDF only, image only, or anything)? */
export function kindSuits(categoryId: string, kind: DocKind): boolean {
  const accept = categoryOf(categoryId)?.accept ?? "any";
  return accept === "any" || (accept === "pdf" ? kind === "pdf" : kind === "jpeg" || kind === "png");
}
export const acceptAttrFor = (categoryId: string) => ({ any: ACCEPT_ATTR, pdf: ".pdf", image: ".jpg,.jpeg,.png" })[categoryOf(categoryId)?.accept ?? "any"];

/** Can the browser show this inside the page (PDF and images)? */
export const canPreview = (mime: string) => mime === KIND_MIME.pdf || mime === KIND_MIME.jpeg || mime === KIND_MIME.png;

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Offer letter.final.pdf" → "Offer letter.final" */
export const nameFromFile = (filename: string) => filename.replace(/\.[^.]+$/, "").trim().slice(0, 120) || "Document";

// ---------- What the form sends ----------

export type DocMeta = {
  category: string;
  name: string;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string;
};

/** Check the fields next to a file. Returns cleaned values or a message for the person. */
export function checkMeta(input: { category?: unknown; name?: unknown; issueDate?: unknown; expiryDate?: unknown; notes?: unknown }): { ok: true; data: DocMeta } | { ok: false; error: string } {
  const category = typeof input.category === "string" ? input.category : "";
  if (!categoryOf(category)) return { ok: false, error: "Choose a category." };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Enter a document name." };
  if (name.length > 120) return { ok: false, error: "Keep the name to 120 characters or fewer." };
  const date = (v: unknown, what: string) => {
    if (v === undefined || v === null || v === "") return { value: null as string | null };
    return isYmd(v) ? { value: v } : { error: `${what} isn't a valid date.` };
  };
  const issue = date(input.issueDate, "The issue date");
  if ("error" in issue) return { ok: false, error: issue.error! };
  const expiry = date(input.expiryDate, "The expiry date");
  if ("error" in expiry) return { ok: false, error: expiry.error! };
  if (issue.value && expiry.value && expiry.value < issue.value) return { ok: false, error: "The expiry date can't be before the issue date." };
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 500) return { ok: false, error: "Keep the notes to 500 characters or fewer." };
  return { ok: true, data: { category, name, issueDate: issue.value, expiryDate: expiry.value, notes } };
}

// ---------- Required documents and profile completion ----------

export type ChecklistState = "missing" | "pending" | "verified" | "rejected";
export type ChecklistItem = { category: Category; state: ChecklistState };

const RANK: Record<ChecklistState, number> = { missing: 0, rejected: 1, pending: 2, verified: 3 };

/** For each required category: the best state among its documents. Pending and verified count as uploaded; rejected does not. */
export function requiredChecklist(docs: { category: string; status: DocStatus }[]): { items: ChecklistItem[]; done: number; total: number } {
  const items = REQUIRED_CATEGORIES.map((category): ChecklistItem => {
    let state: ChecklistState = "missing";
    for (const d of docs) if (d.category === category.id && RANK[d.status] > RANK[state]) state = d.status;
    return { category, state };
  });
  return { items, done: items.filter((i) => i.state === "pending" || i.state === "verified").length, total: items.length };
}

/** Profile completion: a photo, a name, and every required document, each worth one step. */
export function profileCompletion(opts: { hasPhoto: boolean; hasName: boolean; docsDone: number; docsTotal: number }): { percent: number; done: number; total: number } {
  const total = 2 + opts.docsTotal;
  const done = (opts.hasPhoto ? 1 : 0) + (opts.hasName ? 1 : 0) + Math.min(opts.docsDone, opts.docsTotal);
  return { percent: Math.round((done / total) * 100), done, total };
}

/** "expired", "soon" (within 30 days) or null. Dates are YYYY-MM-DD. */
export function expiryState(expiry: string | null, today: string): "expired" | "soon" | null {
  if (!expiry) return null;
  if (expiry < today) return "expired";
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= DOC_EXPIRY_WARNING_DAYS ? "soon" : null;
}
