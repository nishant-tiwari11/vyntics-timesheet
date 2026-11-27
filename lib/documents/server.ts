import "server-only";
import { DOC_BUCKET, type DocStatus, type Visibility } from "./config";
import { createClient } from "@/lib/supabase/server";
import { TimesheetError, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { displayName } from "@/lib/timesheet/people";

// Reading and removing employee documents. Everything runs with the signed-in person's own database session, so
// row-level security (supabase/step26_documents.sql) decides what comes back: nobody gets a row they may not see.

export type DocRow = {
  id: string;
  groupId: string;
  userId: string;
  category: string;
  name: string;
  filename: string;
  mime: string;
  size: number;
  status: DocStatus;
  statusReason: string;
  visibility: Visibility;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string;
  uploadedById: string | null;
  uploadedBy: string;
  version: number;
  isCurrent: boolean;
  createdAt: string;
};

export type Db = {
  id: string;
  group_id: string;
  user_id: string;
  category: string;
  name: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  status_reason: string | null;
  visibility: string;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  uploaded_by: string | null;
  version: number;
  is_current: boolean;
  created_at: string;
};

export const COLUMNS =
  "id, group_id, user_id, category, name, original_filename, mime_type, size_bytes, status, status_reason, visibility, issue_date, expiry_date, notes, uploaded_by, version, is_current, created_at";

/** The migration hasn't been run yet. */
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST202"]);

export function docRowFrom(r: Db, names: Map<string, string>): DocRow {
  return {
    id: r.id,
    groupId: r.group_id,
    userId: r.user_id,
    category: r.category,
    name: r.name,
    filename: r.original_filename,
    mime: r.mime_type,
    size: r.size_bytes,
    status: (["pending", "verified", "rejected"].includes(r.status) ? r.status : "pending") as DocStatus,
    statusReason: r.status_reason ?? "",
    visibility: r.visibility === "hr_only" ? "hr_only" : "employee",
    issueDate: r.issue_date,
    expiryDate: r.expiry_date,
    notes: r.notes ?? "",
    uploadedById: r.uploaded_by,
    uploadedBy: r.uploaded_by ? (r.uploaded_by === r.user_id ? "Employee" : (names.get(r.uploaded_by) ?? "HR")) : "Unknown",
    version: r.version,
    isCurrent: r.is_current,
    createdAt: r.created_at,
  };
}

export type DocumentList = { ready: false; code?: string } | { ready: true; current: DocRow[]; versions: Record<string, DocRow[]> };

/** One person's documents: the current ones, and (for an admin, the only one who can see them) the older versions by group. */
export async function listDocuments(userId: string): Promise<DocumentList> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_documents" as never)
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (MISSING.has(error.code ?? "")) {
      logError("documents not set up", error);
      return { ready: false, code: error.code };
    }
    throw toError(error, "Couldn't load the documents. Please try again.");
  }
  const rows = (data ?? []) as unknown as Db[];

  const ids = [...new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").is("removed_at", null).in("id", ids);
    for (const p of people ?? []) names.set(p.id, displayName(p));
  }

  const toRow = (r: Db) => docRowFrom(r, names);

  const current: DocRow[] = [];
  const versions: Record<string, DocRow[]> = {};
  for (const r of rows) {
    if (r.is_current) current.push(toRow(r));
    else (versions[r.group_id] ??= []).push(toRow(r));
  }
  for (const list of Object.values(versions)) list.sort((a, b) => b.version - a.version);
  return { ready: true, current, versions };
}

/** One document the caller may see (any version an admin may see), or null. */
export async function getDocument(id: string): Promise<Pick<DocRow, "id" | "userId" | "name" | "filename" | "mime" | "version"> & { key: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_documents" as never)
    .select("id, user_id, name, original_filename, mime_type, version, storage_key")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw toError(error, "Couldn't open the document. Please try again.");
  if (!data) return null;
  const r = data as unknown as { id: string; user_id: string; name: string; original_filename: string; mime_type: string; version: number; storage_key: string };
  return { id: r.id, userId: r.user_id, name: r.name, filename: r.original_filename, mime: r.mime_type, version: r.version, key: r.storage_key };
}

/** Note that someone opened or downloaded a document. A failure here never blocks the person from the file. */
export async function logDocumentAccess(documentId: string, action: "view" | "download"): Promise<void> {
  const supabase = await createClient();
  await supabase.from("document_audit" as never).insert({ document_id: documentId, action } as never);
}

/** Delete a document and all its versions. Returns nothing; throws a message the person can read. */
export async function deleteDocument(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doc_delete" as never, { p_id: id } as never);
  if (error) throw toError(error, "Couldn't delete the document. Please try again.");
  const keys = (data ?? []) as unknown as string[];
  if (keys.length > 0) {
    // The rows are already marked deleted; if removing a file fails it is only an orphan nobody can read.
    await supabase.storage.from(DOC_BUCKET).remove(keys);
  }
}

export { TimesheetError };
