import "server-only";
import { DEFAULT_OFFER_TEMPLATE, checkTemplate } from "./offerLetter";
import { DOC_BUCKET } from "./config";
import { createClient } from "@/lib/supabase/server";

export type OfferTemplate = {
  /** The editable wording (used when no Word file is uploaded). */
  body: string;
  /** "docx" = the admin uploaded their own Word template; it is used instead of the wording. */
  kind: "text" | "docx";
  fileName: string;
  fileKey: string;
  /** The template table exists (step28 has been run), so changes can be saved. */
  canSave: boolean;
  /** An admin has saved their own wording (otherwise this is the built-in one). */
  custom: boolean;
  updatedAt: string | null;
};

const MISSING = new Set(["42P01", "PGRST205", "42703"]);

/** The saved offer letter template, or the built-in one. Never throws: a problem here must not stop a letter being made. */
export async function loadOfferTemplate(): Promise<OfferTemplate> {
  const fallback: OfferTemplate = { body: DEFAULT_OFFER_TEMPLATE, kind: "text", fileName: "", fileKey: "", canSave: false, custom: false, updatedAt: null };
  try {
    const supabase = await createClient();
    let res = await supabase.from("document_templates" as never).select("body, updated_at, kind, file_key, file_name").eq("id", "offer_letter").maybeSingle();
    // Before the newer step28 columns exist, fall back to the wording alone.
    if (res.error && res.error.code === "42703") res = await supabase.from("document_templates" as never).select("body, updated_at").eq("id", "offer_letter").maybeSingle();
    if (res.error) return MISSING.has(res.error.code ?? "") ? fallback : { ...fallback, canSave: true };
    if (!res.data) return { ...fallback, canSave: true };
    const row = res.data as unknown as { body: string; updated_at: string; kind?: string; file_key?: string | null; file_name?: string | null };
    // A saved wording that no longer passes the checks is ignored rather than breaking letters.
    const checked = checkTemplate(row.body);
    const docx = row.kind === "docx" && !!row.file_key;
    return {
      body: checked.ok ? checked.data : DEFAULT_OFFER_TEMPLATE,
      kind: docx ? "docx" : "text",
      fileName: docx ? (row.file_name ?? "template.docx") : "",
      fileKey: docx ? (row.file_key ?? "") : "",
      canSave: true,
      custom: checked.ok && checked.data !== DEFAULT_OFFER_TEMPLATE,
      updatedAt: row.updated_at,
    };
  } catch {
    return fallback;
  }
}

/** The uploaded Word template's bytes, or null if it can't be read. */
export async function readTemplateFile(fileKey: string): Promise<Uint8Array | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DOC_BUCKET).download(fileKey);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
