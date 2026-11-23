import "../../dashboard/dashboard.css";
import { redirect } from "next/navigation";
import { loadAdminDocuments } from "@/lib/documents/admin";
import { loadAdminOnboarding } from "@/lib/onboarding/server";
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
  let onboarding;
  try {
    [data, template, onboarding] = await Promise.all([loadAdminDocuments(), loadOfferTemplate(), loadAdminOnboarding()]);
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
      <div className="grid gap-1">
        <h1 className="ts-h1">Documents</h1>
        <p className="text-sm text-muted-foreground">Issue offer and joining letters, check what new employees submit, and follow their onboarding.</p>
      </div>
      {!data.ready ? (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Documents aren&apos;t set up yet. Run <code>supabase/step26_documents.sql</code> and <code>supabase/step27_document_admin.sql</code> in Supabase.
        </p>
      ) : (
        <AdminDocuments docs={data.docs} employees={data.employees} audit={data.audit} truncated={data.truncated} today={todayInOffice()} offerTemplate={template} onboarding={onboarding.rows} />
      )}
    </div>
  );
}
