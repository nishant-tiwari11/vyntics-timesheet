import "server-only";
import { COMPANY_EMAIL_ERROR, isCompanyEmail } from "@/lib/companyEmail";
import { db, requireAdmin } from "./auth";
import { TimesheetError, toError } from "./errors";

export type AllowedEmail = { email: string; created_at: string };

/** Emails an admin has added, newest first. */
export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase
    .from("allowed_emails")
    .select("email, created_at")
    .order("created_at", { ascending: false });
  if (error) throw toError(error, "Couldn't load the list. Please try again.");
  return data;
}

/** Add one or more emails (separated by commas, spaces or new lines). Duplicates are ignored. */
export async function addAllowedEmails(input: string): Promise<number> {
  const admin = await requireAdmin();
  const emails = [
    ...new Set(
      String(input ?? "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (emails.length === 0) throw new TimesheetError("Enter at least one email address.");
  if (emails.length > 50) throw new TimesheetError("Add up to 50 emails at a time.");
  const bad = emails.find((e) => !isCompanyEmail(e));
  if (bad) throw new TimesheetError(`${bad}: ${COMPANY_EMAIL_ERROR}`);

  const supabase = await db();
  const { error } = await supabase
    .from("allowed_emails")
    .upsert(
      emails.map((email) => ({ email, added_by: admin.id })),
      { onConflict: "email", ignoreDuplicates: true }
    );
  if (error) throw toError(error, "Couldn't add the email. Please try again.");
  return emails.length;
}

/** Take an email off the list. Not allowed once that person has an account. */
export async function removeAllowedEmail(email: string): Promise<void> {
  await requireAdmin();
  const clean = String(email ?? "").trim().toLowerCase();
  if (!isCompanyEmail(clean)) throw new TimesheetError(COMPANY_EMAIL_ERROR);

  const supabase = await db();
  const { count, error: findError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .ilike("email", clean.replace(/[\\%_]/g, "\\$&"));
  if (findError) throw toError(findError, "Couldn't remove the email. Please try again.");
  if ((count ?? 0) > 0) throw new TimesheetError("That person already has an account, so they can't be removed here.");

  const { error } = await supabase.from("allowed_emails").delete().eq("email", clean);
  if (error) throw toError(error, "Couldn't remove the email. Please try again.");
}
