import "server-only";
import { randomUUID } from "node:crypto";
import { db, requireUser } from "@/lib/timesheet/auth";
import { TimesheetError, assertId, toError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { BILL_MAX_BYTES, BILL_MAX_PER_CLAIM, BILL_TYPES_TEXT, safeFileName, sniffBill, type Bill } from "./billFile";

// Bills (receipts) attached to expense claims. Who may see or change what is decided by row-level security in the database
// (supabase/step34_expense_bills.sql); the checks here give clear messages and the file itself is checked from its bytes.

export const BILL_BUCKET = "expense-bills";

type Row = { id: string; claim_id: string; storage_key: string; original_filename: string; mime_type: string; size_bytes: number };

const NOT_SET_UP = "Bills aren't set up yet. An admin needs to run supabase/step34_expense_bills.sql in Supabase.";
const isMissing = (e: { code?: string } | null) => ["42P01", "PGRST205", "PGRST204"].includes(e?.code ?? "");

/** The bills of these claims (only the ones you are allowed to see). Before step 34 has been run there are simply none. */
export async function listBillsFor(claimIds: string[]): Promise<Map<string, Bill[]>> {
  const out = new Map<string, Bill[]>();
  if (claimIds.length === 0) return out;
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("expense_bills" as never)
    .select("id, claim_id, original_filename, mime_type, size_bytes")
    .in("claim_id", claimIds)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (!isMissing(error)) logError("expense bills", error);
    return out;
  }
  for (const r of data as unknown as Row[]) {
    out.set(r.claim_id, [...(out.get(r.claim_id) ?? []), { id: r.id, claimId: r.claim_id, name: r.original_filename, mime: r.mime_type, size: r.size_bytes }]);
  }
  return out;
}

/** Attach a bill to one of your own claims that is still a draft or waiting for approval. */
export async function addBill(claimId: string, file: File): Promise<Bill> {
  assertId(claimId, "expense");
  const me = await requireUser();
  if (file.size === 0) throw new TimesheetError("Choose a file first.");
  if (file.size > BILL_MAX_BYTES) throw new TimesheetError("That file is too large. Use a file up to 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffBill(bytes);
  if (!kind) throw new TimesheetError(`That file type isn't allowed. Use a ${BILL_TYPES_TEXT}.`);

  const supabase = await db();
  const { data: claim, error: claimError } = await supabase.from("expense_claims").select("id, status").eq("id", claimId).eq("user_id", me.id).maybeSingle();
  if (claimError) throw toError(claimError, "Couldn't check the expense. Please try again.");
  if (!claim) throw new TimesheetError("That expense could not be found.");
  if (claim.status !== "draft" && claim.status !== "pending") throw new TimesheetError("Bills can only be added before the expense is decided.");

  const existing = await supabase.from("expense_bills" as never).select("id", { count: "exact", head: true }).eq("claim_id", claimId);
  if (existing.error) throw isMissing(existing.error) ? new TimesheetError(NOT_SET_UP) : toError(existing.error, "Couldn't check the bills. Please try again.");
  if ((existing.count ?? 0) >= BILL_MAX_PER_CLAIM) throw new TimesheetError(`You can attach up to ${BILL_MAX_PER_CLAIM} bills to one expense.`);

  const key = `${me.id}/${randomUUID()}.${kind.ext}`;
  const filename = safeFileName(file.name);
  const up = await supabase.storage.from(BILL_BUCKET).upload(key, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    logError("expense bill upload", up.error);
    throw new TimesheetError(/not found|bucket/i.test(up.error.message) ? NOT_SET_UP : "Couldn't upload the bill. Please try again.");
  }
  const { data, error } = await supabase
    .from("expense_bills" as never)
    .insert({ claim_id: claimId, user_id: me.id, storage_key: key, original_filename: filename, mime_type: kind.mime, size_bytes: file.size } as never)
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BILL_BUCKET).remove([key]); // don't leave a file nobody can see
    throw toError(error, "Couldn't attach the bill. Please try again.");
  }
  return { id: (data as unknown as { id: string }).id, claimId, name: filename, mime: kind.mime, size: file.size };
}

/** Remove a bill from your own claim while it is still a draft or pending. */
export async function removeBill(id: string): Promise<void> {
  assertId(id, "bill");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("expense_bills" as never).delete().eq("id", id).select("storage_key");
  if (error) throw toError(error, "Couldn't remove the bill. Please try again.");
  const rows = data as unknown as { storage_key: string }[];
  if (!rows?.length) throw new TimesheetError("That bill can't be removed. It may already be decided.");
  const removed = await supabase.storage.from(BILL_BUCKET).remove(rows.map((r) => r.storage_key));
  if (removed.error) logError("expense bill remove", removed.error); // the row is gone; a stray file is harmless and private
}

/** A link to the file that works for one minute. Only people the table lets read the bill (its owner, and admins) get one. */
export async function billSignedUrl(id: string): Promise<{ url: string; name: string } | null> {
  assertId(id, "bill");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("expense_bills" as never).select("storage_key, original_filename").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { storage_key: string; original_filename: string };
  const signed = await supabase.storage.from(BILL_BUCKET).createSignedUrl(row.storage_key, 60);
  if (signed.error || !signed.data?.signedUrl) return null;
  return { url: signed.data.signedUrl, name: row.original_filename };
}
