import Link from "next/link";
import { redirect } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAccess, type AccessData } from "@/lib/access/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import AccessManager from "./AccessManager";

export const metadata = { title: "Admin · Access" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  user_added: "Added a person",
  user_updated: "Updated a person",
  user_changed: "Changed role, status or expiry",
  user_removed: "Removed a person",
  password_user_created: "Created a password account",
  password_reset: "Reset a password",
  manager_set: "Set a manager",
  role_changed: "Changed a role",
  account_locked: "Account locked after wrong passwords",
};

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
        <Link href="/timesheet/admin" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Admin
        </Link>
        <h1 className="ts-h1">Access</h1>
        <p className="text-sm text-muted-foreground">
          Anyone with a Google account on {data ? data.domains.map((d) => `@${d}`).join(", ") : "a company domain"} can sign in. This list adds everyone else, and sets each person&apos;s role.
        </p>
      </div>

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

          <section aria-label="Access log" className="grid gap-2 border-t pt-5">
            <h2 className="text-base font-semibold">Access log</h2>
            <p className="text-sm text-muted-foreground">Who changed what, and when. Passwords are never recorded.</p>
            {data.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <caption className="sr-only">Recent access changes</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead>About</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                        <TableCell className="break-all">{a.actor}</TableCell>
                        <TableCell>{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                        <TableCell className="break-all">{a.target || "-"}</TableCell>
                        <TableCell className="max-w-72 break-words whitespace-normal text-muted-foreground">{a.detail || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
