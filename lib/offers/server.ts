import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isUuid } from "@/lib/avatar";
import { DOC_BUCKET } from "@/lib/documents/config";
import { sniffBill, safeFileName, BILL_MAX_BYTES } from "@/lib/expenses/billFile";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { db, requireAdmin, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { buildLetter } from "./build";
import { checkLetter } from "./check";
import { DEFAULT_CLAUSES, mergeClauses, type ClauseKey } from "./clauses";
import { buildLetterPdf } from "./pdf";
import { DEFAULT_COMPANY, ENGAGEMENT_TYPES, isEngagementType, type CompanyInfo, type EngagementType, type LetterData } from "./types";

// Offer letters, server side. Who may do what is decided by the database (supabase/step41_offer_letters.sql): only admins write
// letters and settings, and a person reads only their own SENT or ACCEPTED letter. The checks here give clear messages.

export const OFFER_STATUSES = ["draft", "sent", "accepted"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
const isStatus = (v: unknown): v is OfferStatus => (OFFER_STATUSES as readonly unknown[]).includes(v);

const NOT_SET_UP = "Offer letters aren't set up yet. An admin needs to run supabase/step41_offer_letters.sql in Supabase.";
const isMissing = (e: { code?: string } | null) => ["42P01", "42883", "PGRST202", "PGRST205"].includes(e?.code ?? "");
const failure = (e: { code?: string; message: string }, fallback: string) =>
  isMissing(e) ? new TimesheetError(NOT_SET_UP) : e.code === "P0001" ? new TimesheetError(e.message || fallback) : toError(e, fallback);

// ---------------------------------------------------------------- settings
export type OfferSettings = { ready: boolean; company: CompanyInfo; clauses: Record<ClauseKey, string>; custom: ClauseKey[] };

function cleanCompany(v: unknown): CompanyInfo {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (k: keyof CompanyInfo, max: number) => (typeof o[k] === "string" ? (o[k] as string).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
  return {
    name: text("name", 100) || DEFAULT_COMPANY.name,
    gstin: text("gstin", 20),
    registeredAddress: text("registeredAddress", 300),
    city: text("city", 80),
    signatoryName: text("signatoryName", 100),
    signatoryTitle: text("signatoryTitle", 100),
  };
}

export async function loadOfferSettings(): Promise<OfferSettings> {
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("offer_settings" as never).select("company, clauses").eq("id", true).maybeSingle();
  if (error) {
    if (!isMissing(error)) logError("offer settings", error);
    return { ready: false, company: DEFAULT_COMPANY, clauses: DEFAULT_CLAUSES, custom: [] };
  }
  const row = (data ?? { company: {}, clauses: {} }) as unknown as { company: unknown; clauses: unknown };
  const clauses = mergeClauses(row.clauses);
  const custom = (Object.keys(clauses) as ClauseKey[]).filter((k) => clauses[k] !== DEFAULT_CLAUSES[k]);
  return { ready: true, company: cleanCompany(row.company), clauses, custom };
}

export async function saveOfferSettings(company: unknown, clauses: unknown): Promise<void> {
  await requireAdmin();
  const c = cleanCompany(company);
  // Only the pieces that differ from the standard wording are stored.
  const merged = mergeClauses(clauses);
  const changed: Partial<Record<ClauseKey, string>> = {};
  for (const k of Object.keys(DEFAULT_CLAUSES) as ClauseKey[]) if (merged[k] !== DEFAULT_CLAUSES[k]) changed[k] = merged[k];
  const supabase = await db();
  const { error } = await supabase.rpc("offer_settings_save" as never, { p_company: c, p_clauses: changed } as never);
  if (error) throw failure(error, "Couldn't save the settings. Please try again.");
}

// ---------------------------------------------------------------- letters
export type OfferRow = {
  id: string;
  groupId: string;
  version: number;
  isCurrent: boolean;
  /** The employee it is linked to, or null for a letter made for someone with no account in the portal. */
  userId: string | null;
  status: OfferStatus;
  type: EngagementType;
  name: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  acceptedOn: string | null;
  method: "typed" | "upload" | null;
  documentId: string | null;
  signedDocumentId: string | null;
};
type Db = {
  id: string; group_id: string; version: number; is_current: boolean; user_id: string | null; status: string; engagement_type: string; candidate_name: string;
  created_at: string; updated_at: string; sent_at: string | null; accepted_at: string | null; accepted_name: string | null; accepted_on: string | null;
  accept_method: string | null; document_id: string | null; signed_document_id: string | null; data?: unknown;
};
const COLUMNS = "id, group_id, version, is_current, user_id, status, engagement_type, candidate_name, created_at, updated_at, sent_at, accepted_at, accepted_name, accepted_on, accept_method, document_id, signed_document_id";

const toRow = (r: Db): OfferRow => ({
  id: r.id,
  groupId: r.group_id,
  version: r.version,
  isCurrent: r.is_current,
  userId: r.user_id,
  status: isStatus(r.status) ? r.status : "draft",
  type: isEngagementType(r.engagement_type) ? r.engagement_type : "phased_internship",
  name: r.candidate_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  sentAt: r.sent_at,
  acceptedAt: r.accepted_at,
  acceptedName: r.accepted_name,
  acceptedOn: r.accepted_on,
  method: r.accept_method === "typed" || r.accept_method === "upload" ? r.accept_method : null,
  documentId: r.document_id,
  signedDocumentId: r.signed_document_id,
});

export type OfferFilter = { type?: string; status?: string; q?: string };

/** The current version of every letter, newest first. */
export async function listOffers(filter: OfferFilter = {}): Promise<{ ready: boolean; rows: OfferRow[]; truncated: boolean }> {
  await requireAdmin();
  const supabase = await db();
  let query = supabase.from("offer_letters" as never).select(COLUMNS).eq("is_current", true).order("updated_at", { ascending: false }).limit(301);
  if (isEngagementType(filter.type)) query = query.eq("engagement_type", filter.type);
  if (isStatus(filter.status)) query = query.eq("status", filter.status);
  const q = (filter.q ?? "").trim().slice(0, 60).replace(/[%_,()]/g, " ");
  if (q) query = query.ilike("candidate_name", `%${q}%`);
  const { data, error } = await query;
  if (error) {
    if (isMissing(error)) return { ready: false, rows: [], truncated: false };
    throw toError(error, "Couldn't load the letters. Please try again.");
  }
  const rows = (data as unknown as Db[]).map(toRow);
  return { ready: true, rows: rows.slice(0, 300), truncated: rows.length > 300 };
}

export type OfferDetail = { row: OfferRow; data: Partial<LetterData>; versions: OfferRow[] };

/** One letter with its details and every version of it. Admins can open any; a person only their own sent or accepted one. */
export async function getOffer(id: string): Promise<OfferDetail | null> {
  if (!isUuid(id)) return null;
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("offer_letters" as never).select(`${COLUMNS}, data`).eq("id", id).maybeSingle();
  if (error) {
    if (isMissing(error)) return null;
    throw toError(error, "Couldn't load the letter. Please try again.");
  }
  if (!data) return null;
  const r = data as unknown as Db;
  const vs = await supabase.from("offer_letters" as never).select(COLUMNS).eq("group_id", r.group_id).order("version", { ascending: false }).limit(50);
  return { row: toRow(r), data: (r.data ?? {}) as Partial<LetterData>, versions: ((vs.data ?? []) as unknown as Db[]).map(toRow) };
}

/** The signed-in person's own current letter that has been sent to them (or that they have accepted). */
export async function getMyOffer(): Promise<OfferDetail | null> {
  const me = await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("offer_letters" as never)
    .select("id")
    .eq("user_id", me.id)
    .eq("is_current", true)
    .in("status", ["sent", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return getOffer((data as unknown as { id: string }).id);
}

/** `userId` null (or empty) makes a letter for someone who has no account in the portal: it can be previewed and downloaded, and linked to an employee later. */
export async function saveOffer(id: string | null, userId: string | null, input: unknown): Promise<string> {
  await requireAdmin();
  if (userId !== null && userId !== "" && !isUuid(userId)) throw new TimesheetError("Choose the employee.");
  if (id !== null && !isUuid(id)) throw new TimesheetError("That letter could not be found.");
  const checked = checkLetter(input);
  if (!checked.ok) throw new TimesheetError(checked.error);
  const supabase = await db();
  const { data, error } = await supabase.rpc("offer_save" as never, { p_id: id, p_user: userId || null, p_data: checked.data } as never);
  if (error) throw failure(error, "Couldn't save the letter. Please try again.");
  return data as unknown as string;
}

export async function deleteOffer(id: string): Promise<void> {
  await requireAdmin();
  if (!isUuid(id)) throw new TimesheetError("That letter could not be found.");
  const supabase = await db();
  const { error } = await supabase.rpc("offer_delete" as never, { p_id: id } as never);
  if (error) throw failure(error, "Couldn't delete the draft. Please try again.");
}

// ---------------------------------------------------------------- the PDF
/**
 * One of the letter's pictures from the private documents bucket. An employee can't read that folder, but their letter must still show
 * the company's signature, so the server reads it itself. This is only reached after the caller has been checked as someone who may
 * have this letter (an admin, or the person it was sent to).
 */
export async function readAsset(kind: "logo" | "signature" | "seal"): Promise<Uint8Array | null> {
  const key = `templates/${kind}.png`;
  const fetchWith = async (client: { storage: ReturnType<typeof createServiceClient>["storage"] }) => {
    const { data, error } = await client.storage.from(DOC_BUCKET).download(key);
    return error || !data ? null : new Uint8Array(await data.arrayBuffer());
  };
  // The server's own key first (it works for an employee's letter too). Where that key isn't set, such as a local copy, an admin's
  // own sign-in can read the pictures.
  try {
    const found = await fetchWith(createServiceClient());
    if (found) return found;
  } catch {
    /* no server key here: try the signed-in person's access */
  }
  try {
    return await fetchWith(await createClient());
  } catch {
    return null;
  }
}

/** The company logo: the one an admin uploaded in settings, else the portal's own. null if neither can be read. */
export async function readLogo(): Promise<Uint8Array | null> {
  const uploaded = await readAsset("logo");
  if (uploaded) return uploaded;
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "app/timesheet/login/vyntics-logo.png")));
  } catch {
    return null;
  }
}

export async function renderOfferPdf(data: LetterData, typed?: { name: string; date: string }): Promise<Uint8Array> {
  const settings = await loadOfferSettings();
  const doc = buildLetter(data, settings.company, settings.clauses);
  if (typed) for (const b of doc.blocks) if (b.t === "acceptance") b.typed = typed;
  const [logo, signature, seal] = await Promise.all([readLogo(), readAsset("signature"), readAsset("seal")]);
  return buildLetterPdf(doc, { ...(logo ? { logo } : {}), ...(signature ? { signature } : {}), ...(seal ? { seal } : {}) });
}

const asLetter = (d: Partial<LetterData>): LetterData | null => {
  const r = checkLetter(d);
  return r.ok ? r.data : null;
};

/** The PDF of a letter, for download. A draft is typeset on the spot; admins can fetch any, a person only their own sent or accepted one. */
export async function offerPdfFor(id: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const found = await getOffer(id);
  if (!found) return null;
  const me = await requireUser();
  if (me.role !== "admin" && (found.row.userId !== me.id || found.row.status === "draft")) return null;
  const data = asLetter(found.data);
  if (!data) throw new TimesheetError("This letter has details that need fixing. Open it and check the form.");
  const typed = found.row.method === "typed" && found.row.acceptedName && found.row.acceptedOn ? { name: found.row.acceptedName, date: found.row.acceptedOn } : undefined;
  return { bytes: await renderOfferPdf(data, typed), name: `Offer letter - ${safeFileName(found.row.name)}${found.row.version > 1 ? ` (v${found.row.version})` : ""}.pdf` };
}

// ---------------------------------------------------------------- storing a PDF on the employee's profile
async function storeDocument(opts: { userId: string; bytes: Uint8Array; mime: string; filename: string; name: string; issue: string; notes: string; replace: string | null }): Promise<string> {
  const supabase = await createClient();
  const key = `${opts.userId}/${crypto.randomUUID()}`;
  const up = await supabase.storage.from(DOC_BUCKET).upload(key, opts.bytes, { contentType: opts.mime, upsert: false });
  if (up.error) {
    logError("offer letter upload", up.error);
    throw new TimesheetError("Couldn't store the file. Please try again.");
  }
  const { data, error } = await supabase.rpc("doc_create" as never, {
    p_user: opts.userId,
    p_category: "offer_letter",
    p_name: opts.name,
    p_filename: opts.filename,
    p_key: key,
    p_mime: opts.mime,
    p_size: opts.bytes.byteLength,
    p_issue: opts.issue,
    p_expiry: null,
    p_notes: opts.notes,
    p_visibility: "employee",
    p_replace: opts.replace,
  } as never);
  if (error) {
    await supabase.storage.from(DOC_BUCKET).remove([key]);
    throw error.code === "P0001" ? new TimesheetError(error.message) : toError(error, "Couldn't save the file. Please try again.");
  }
  return data as unknown as string;
}

/** Draft -> Sent: the PDF is stored on the employee's profile under Documents and the letter is locked. */
export async function sendOffer(id: string): Promise<void> {
  await requireAdmin();
  const found = await getOffer(id);
  if (!found) throw new TimesheetError("That letter could not be found.");
  if (!found.row.isCurrent || found.row.status !== "draft") throw new TimesheetError("Only the current draft can be sent.");
  const data = asLetter(found.data);
  if (!data) throw new TimesheetError("Fix the details first, then save the draft before sending.");
  if (!found.row.userId) throw new TimesheetError("Link this letter to an employee before sending it.");

  // The earlier version's profile entry (if it was sent) becomes the earlier version of this document.
  const older = found.versions.find((v) => v.version < found.row.version && v.documentId);
  const bytes = await renderOfferPdf(data);
  const docId = await storeDocument({
    userId: found.row.userId,
    bytes,
    mime: "application/pdf",
    filename: `Offer letter - ${safeFileName(found.row.name)} (v${found.row.version}).pdf`,
    name: "Offer Letter",
    issue: data.letterDate,
    notes: `Version ${found.row.version}. Joining date ${data.joiningDate}`,
    replace: older?.documentId ?? null,
  });
  const supabase = await db();
  const { error } = await supabase.rpc("offer_mark_sent" as never, { p_id: id, p_doc: docId } as never);
  if (error) throw failure(error, "Couldn't send the letter. Please try again.");
}

// ---------------------------------------------------------------- accepting (the employee)
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Accept by typing your name and the date. The stored PDF is then redrawn with the acceptance on it (a failure there doesn't undo the acceptance). */
export async function acceptTyped(id: string, name: string, date: string): Promise<void> {
  const me = await requireUser();
  if (!isUuid(id)) throw new TimesheetError("That letter could not be found.");
  const found = await getOffer(id);
  if (!found || found.row.userId !== me.id) throw new TimesheetError("That letter could not be found.");
  const typedName = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const supabase = await db();
  const { error } = await supabase.rpc("offer_accept" as never, { p_id: id, p_name: typedName, p_on: date, p_method: "typed", p_signed_doc: null } as never);
  if (error) throw failure(error, "Couldn't record your acceptance. Please try again.");
  try {
    const data = asLetter(found.data);
    if (data) {
      const bytes = await renderOfferPdf(data, { name: typedName, date });
      await storeDocument({
        userId: me.id,
        bytes,
        mime: "application/pdf",
        filename: `Offer letter - ${safeFileName(found.row.name)} (accepted).pdf`,
        name: "Offer Letter",
        issue: data.letterDate,
        notes: `Accepted by ${typedName} on ${date}`,
        replace: found.row.documentId,
      });
    }
  } catch (e) {
    logError("offer letter accepted pdf", e);
  }
}

/** Accept by uploading a signed copy (PDF or a photo). It is stored on your profile as its own document. */
export async function acceptUpload(id: string, file: File): Promise<void> {
  const me = await requireUser();
  if (!isUuid(id)) throw new TimesheetError("That letter could not be found.");
  const found = await getOffer(id);
  if (!found || found.row.userId !== me.id) throw new TimesheetError("That letter could not be found.");
  if (found.row.status !== "sent" || !found.row.isCurrent) throw new TimesheetError("This letter is not waiting for your acceptance.");
  if (file.size === 0) throw new TimesheetError("Choose the signed copy first.");
  if (file.size > BILL_MAX_BYTES) throw new TimesheetError("That file is too large. Use a file up to 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffBill(bytes);
  if (!kind) throw new TimesheetError("Use a PDF, JPG, PNG or WebP file.");
  const docId = await storeDocument({
    userId: me.id,
    bytes,
    mime: kind.mime,
    filename: safeFileName(file.name) || `signed-offer-letter.${kind.ext}`,
    name: "Offer Letter (signed copy)",
    issue: todayIst(),
    notes: `Signed copy of version ${found.row.version}`,
    replace: null,
  });
  const supabase = await db();
  const { error } = await supabase.rpc("offer_accept" as never, { p_id: id, p_name: null, p_on: todayIst(), p_method: "upload", p_signed_doc: docId } as never);
  if (error) throw failure(error, "Couldn't record your acceptance. Please try again.");
}

export const ENGAGEMENT_LABEL = Object.fromEntries(ENGAGEMENT_TYPES.map((t) => [t.id, t.label])) as Record<EngagementType, string>;
