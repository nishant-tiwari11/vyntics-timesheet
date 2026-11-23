import Link from "next/link";
import { listAllowedEmails } from "@/lib/timesheet/access";
import { listEmployees } from "@/lib/timesheet/admin";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { SectionError } from "../dashboard/sections";
import { AddEmailsForm, RemoveEmailButton } from "./AccessControls";
import EmployeesTable from "./EmployeesTable";

const BASE = "/timesheet/admin";

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

// Data is loaded inside try/catch; the page (JSX) is built outside it.
async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin", e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}

function LoadError({ message, retryHref }: { message: string; retryHref: string }) {
  return (
    <section className="ts-card">
      <SectionError message={message} />
      <Link href={retryHref} className="ts-btn ts-btn-sm">
        Try again
      </Link>
    </section>
  );
}

// -------------------------------- Employees --------------------------------

export async function EmployeesTab({ adminId }: { adminId: string }) {
  const res = await load(() => listEmployees());

  if (!res.ok) return <LoadError message={res.error} retryHref={`${BASE}?tab=employees`} />;
  if (res.data.length === 0) {
    return (
      <section className="ts-card">
        <p className="ts-muted">There are no employees yet.</p>
      </section>
    );
  }
  return (
    <section className="ts-card ts-flush" aria-label="Employees">
      <EmployeesTable rows={res.data.map((p) => ({ ...p, isSelf: p.id === adminId }))} />
    </section>
  );
}

// ---------------------------------- Access ----------------------------------

export async function AccessTab() {
  const res = await load(async () => {
    const [allowed, people] = await Promise.all([listAllowedEmails(), listEmployees()]);
    return { allowed, joined: new Set(people.map((p) => p.email.toLowerCase())) };
  });

  return (
    <>
      <section className="ts-card" aria-labelledby="access-title">
        <h2 className="ts-h2b" id="access-title">
          Who can sign in
        </h2>
        <p className="ts-muted ts-small ts-access-note">
          Only @vyntics.com addresses on this list can create an account, with Google or a password. People who already
          have an account are on it automatically.
        </p>
        <AddEmailsForm />
      </section>

      {!res.ok ? (
        <LoadError message={res.error} retryHref={`${BASE}?tab=access`} />
      ) : res.data.allowed.length === 0 ? (
        <section className="ts-card">
          <p className="ts-muted">No emails have been added yet.</p>
        </section>
      ) : (
        <section className="ts-card ts-flush" aria-label="Allowed emails">
          <div className="ts-table-wrap" tabIndex={0} role="region" aria-label="Allowed emails, scrolls sideways">
            <table className="ts-table ts-logs-table">
              <caption className="ts-sr-only">Email addresses allowed to sign in, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Added</th>
                  <th scope="col">
                    <span className="ts-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data.allowed.map((a) => {
                  const joined = res.data.joined.has(a.email);
                  return (
                    <tr key={a.email}>
                      <td data-label="Email">{a.email}</td>
                      <td data-label="Status">
                        <span className={`ts-pill ${joined ? "ts-pill-approved" : "ts-pill-pending"}`}>
                          {joined ? "Joined" : "Invited"}
                        </span>
                      </td>
                      <td data-label="Added" className="ts-nowrap">
                        {formatInstantDate(a.created_at)}
                      </td>
                      <td className="ts-actions">{!joined && <RemoveEmailButton email={a.email} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
