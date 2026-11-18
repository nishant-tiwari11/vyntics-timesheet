"use client";

import Link from "next/link";
import { useState } from "react";
import { ROLE_LABEL, type Role } from "@/lib/access/config";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { UserAvatar } from "../../_components/UserAvatar";
import { setRoleAction } from "./actions";
import ConfirmAction from "./ConfirmAction";
import ResultMessage, { type Result } from "./ResultMessage";

export type EmployeeRowData = {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
  isSelf: boolean;
};

export default function EmployeesTable({ rows }: { rows: EmployeeRowData[] }) {
  const [result, setResult] = useState<Result>(null);

  async function change(row: EmployeeRowData, role: "employee" | "admin") {
    setResult(null);
    const res = await setRoleAction(row.id, role);
    setResult(
      res.ok
        ? { ok: true, text: `${row.name} is now ${role === "admin" ? "an admin" : "an employee"}.` }
        : { ok: false, text: res.error }
    );
  }

  return (
    <>
      <ResultMessage result={result} />
      <div className="ts-sheet-scroll" tabIndex={0} role="region" aria-label="Employees, scrolls sideways">
        <table className="ts-atable">
          <caption className="ts-sr-only">Everyone with an account</caption>
          <thead>
            <tr>
              <th scope="col" className="ts-afirst">
                Name
              </th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Joined</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const first = r.name.split(" ")[0];
              return (
                <tr key={r.id}>
                  <th scope="row" className="ts-afirst">
                    <span className="flex items-center gap-2">
                      <UserAvatar userId={r.id} name={r.name} className="size-8 text-xs" />
                      <span className="min-w-0">
                        <Link href={`/timesheet/profile?user=${r.id}`} className="ts-aname hover:underline">
                          {r.name}
                        </Link>
                        {r.isSelf && <span className="ts-asub">You</span>}
                      </span>
                    </span>
                  </th>
                  <td>{r.email}</td>
                  <td>
                    <span className={`ts-chip ${r.role === "admin" ? "ts-chip-approved" : "ts-chip-draft"}`}>
                      {ROLE_LABEL[r.role]}
                    </span>
                  </td>
                  <td>{formatInstantDate(r.created_at)}</td>
                  <td>
                    {/* Server and database both refuse to change your own role; no button on your row. */}
                    {!r.isSelf &&
                      (r.role !== "admin" ? (
                        <ConfirmAction
                          label="Make admin"
                          question={`Make ${first} an admin? They will be able to approve requests and see everyone's work logs.`}
                          confirmLabel="Yes, make admin"
                          onConfirm={() => change(r, "admin")}
                        />
                      ) : (
                        <ConfirmAction
                          label="Remove admin"
                          question={`Remove ${first} as an admin? They will no longer be able to approve requests or see everyone's work logs.`}
                          confirmLabel="Yes, remove admin"
                          danger
                          onConfirm={() => change(r, "employee")}
                        />
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
