import "../../dashboard/dashboard.css";
import { redirect } from "next/navigation";
import { loadAdminDocuments } from "@/lib/documents/admin";
import { loadAdminOnboarding } from "@/lib/onboarding/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { AdminDocuments } from "./AdminDocuments";

export const metadata = { title: "Documents (admin)" };

// HR's view of everyone's documents: filters, verification, ZIP download, letters to issue, onboarding, and which managers may see
// sensitive documents. Admin only (proxy.ts blocks others; this checks again on every load). Only what the first tab needs is read
// here; the activity list and the offer letter template are read when their tabs are opened.
export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const asked = Array.isArray(raw.view) ? raw.view[0] : raw.view;
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  let data;
  let onboarding;
  try {
    // Both read the same documents and people (once, shared) at the same time as their own small tables.
    [data, onboarding] = await Promise.all([loadAdminDocuments(), loadAdminOnboarding()]);
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
        <AdminDocuments
          docs={data.docs}
          employees={data.employees}
          truncated={data.truncated}
          today={todayInOffice()}
          onboarding={onboarding.rows}
          initialView={asked === "onboarding" || asked === "documents" || asked === "offer" || asked === "activity" || asked === "managers" ? asked : "action"}
        />
      )}
    </div>
  );
}
