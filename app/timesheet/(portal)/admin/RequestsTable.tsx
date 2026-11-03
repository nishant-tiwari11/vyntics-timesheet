"use client";

import { useState } from "react";
import { daysInclusive, formatRange } from "@/lib/timesheet/dates";
import { decideRequestAction } from "./actions";
import ResultMessage, { type Result } from "./ResultMessage";

export type RequestRowData = {
  id: string;
  name: string;
  email: string;
  isSelf: boolean;
  type: "leave" | "wfh";
  from: string;
  to: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  alsoOff: string[];
};

const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

export default function RequestsTable({ rows }: { rows: RequestRowData[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  async function decide(row: RequestRowData, decision: "approved" | "rejected") {
    setBusy(row.id);
    setResult(null);
    const res = await decideRequestAction(row.id, decision);
    setBusy(null);
    setResult(
      res.ok
        ? { ok: true, text: `${row.name}'s request was ${decision === "approved" ? "approved" : "rejected"}.` }
        : { ok: false, text: res.error }
    );
  }

  return (
    <>
      <ResultMessage result={result} />
      <div className="ts-sheet-scroll" tabIndex={0} role="region" aria-label="Requests, scrolls sideways">
        <table className="ts-atable">
          <caption className="ts-sr-only">Leave and work from home requests, pending first, then newest</caption>
          <thead>
            <tr>
              <th scope="col" className="ts-afirst">
                Employee
              </th>
              <th scope="col">Type</th>
              <th scope="col">Dates</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const n = daysInclusive(r.from, r.to);
              const working = busy === r.id;
              return (
                <tr key={r.id}>
                  <th scope="row" className="ts-afirst">
                    <span className="ts-aname">{r.name}</span>
                    <span className="ts-asub">{r.email}</span>
                  </th>
                  <td>{r.type === "leave" ? "Leave" : "Work from home"}</td>
                  <td>
                    {formatRange(r.from, r.to)}{" "}
                    <span className="ts-muted">
                      · {n} {n === 1 ? "day" : "days"}
                    </span>
                    {r.alsoOff.length > 0 && (
                      <span className="ts-also-off">Also off: {r.alsoOff.join(", ")}</span>
                    )}
                  </td>
                  <td className="ts-areason">{r.reason || <span className="ts-muted">—</span>}</td>
                  <td>
                    <span className={`ts-chip ts-chip-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td>
                    {r.status === "pending" &&
                      (r.isSelf ? (
                        <span className="ts-small ts-muted">Your own request. Another admin decides.</span>
                      ) : (
                        <span className="ts-actions-cell">
                          <button
                            type="button"
                            className="ts-btn ts-btn-sm"
                            onClick={() => void decide(r, "approved")}
                            disabled={working}
                            aria-label={`Approve ${r.name}'s request, ${formatRange(r.from, r.to)}`}
                          >
                            {working ? "Working..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            className="ts-btn ts-btn-ghost ts-btn-sm"
                            onClick={() => void decide(r, "rejected")}
                            disabled={working}
                            aria-label={`Reject ${r.name}'s request, ${formatRange(r.from, r.to)}`}
                          >
                            Reject
                          </button>
                        </span>
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
