import "../../dashboard/dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAdminDocuments } from "@/lib/documents/admin";
import { loadOfferTemplate } from "@/lib/documents/offerTemplate";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { AdminDocuments } from "./AdminDocuments";

export const metadata = { title: "Documents (admin)" };

// HR's view of everyone's documents: filters, verification, ZIP download, missing documents, activity, and which
// managers may see sensitive documents. Admin only (proxy.ts blocks others; this checks again on every load).
export default async function AdminDocumentsPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  let data;
  let template;
  try {
    [data, template] = await Promise.all([loadAdminDocuments(), loadOfferTemplate()]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin documents", e);
    return (
      <div className="ts-page ts-dash grid gap-4">
        <h1 className="ts-h1">Documents</h1>
        <p className="ts-alert" role="alert">
          {e instanceof TimesheetError ? e.message : "Something went wrong. Please try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="ts-page ts-dash grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="ts-h1">Documents</h1>
        <Link href="/timesheet/admin?tab=employees" className="ts-link text-sm">
          ← Back to Admin
        </Link>
      </div>
      {!data.ready ? (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Documents aren&apos;t set up yet. Run <code>supabase/step26_documents.sql</code> and <code>supabase/step27_document_admin.sql</code> in Supabase.
        </p>
      ) : (
        <AdminDocuments docs={data.docs} employees={data.employees} audit={data.audit} truncated={data.truncated} today={todayInOffice()} offerTemplate={template} />
      )}
    </div>
  );
}
