import { redirect } from "next/navigation";
import { loadAccess, type AccessData } from "@/lib/access/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import AccessManager from "./AccessManager";

export const metadata = { title: "Employees" };
export const dynamic = "force-dynamic";


function Summary({ rows, domains }: { rows: AccessData["rows"]; domains: string[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const live = rows.filter((r) => r.status === "active" && !(r.expiresOn && r.expiresOn < today));
  const cards: [string, number, string][] = [
    ["Active", live.length, `of ${rows.length} accounts`],
    ["Admins and managers", rows.filter((r) => r.role === "admin" || r.role === "manager").length, "can approve and manage"],
    ["Not signed in yet", rows.filter((r) => !r.signedIn).length, "added, waiting for first login"],
    ["Disabled or expired", rows.length - live.length, "cannot sign in"],
  ];
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        {cards.map(([label, n, note]) => (
          <li key={label} className="rounded-xl border bg-card p-4">
            <span className="block text-sm text-muted-foreground">{label}</span>
            <span className="mt-1 block text-3xl font-semibold tabular-nums">{n}</span>
            <span className="block text-xs text-muted-foreground">{note}</span>
          </li>
        ))}
      </ul>
      <p className="-mt-2 text-xs text-muted-foreground">Anyone with a Google account on {domains.map((d) => `@${d}`).join(", ") || "a company domain"} can sign in; add everyone else below.</p>
    </>
  );
}

// Who can sign in, with what role, and a record of every change. Admins only: the proxy and this page both check, and so
// does every action behind it and the database.
export default async function AccessPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  let data: AccessData | null = null;
  let error: string | null = null;
  try {
    data = await loadAccess();
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("access-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <div className="ts-page grid gap-5">
      <div className="grid gap-1">
        <h1 className="ts-h1">Employees</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in the company: roles, departments, managers and who can sign in. Open a person to see their work, leave, expenses and pay.
        </p>
      </div>

      {data?.ready && <Summary rows={data.rows} domains={data.domains} />}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {data && !data.ready && (
        <div className="rounded-lg border border-dashed p-4 text-sm" role="note">
          <strong>One-time setup needed.</strong> Run <code>supabase/step24a_roles.sql</code> and then <code>supabase/step24_access.sql</code> in the Supabase SQL editor. Until then this page can&apos;t show or change access.
        </div>
      )}

      {data?.ready && (
        <>
          <AccessManager rows={data.rows} managers={data.managers} />
        </>
      )}
    </div>
  );
}
