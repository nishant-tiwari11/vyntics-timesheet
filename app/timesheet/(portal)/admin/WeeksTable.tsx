"use client";

import { Fragment, useState } from "react";
import { addDays, formatYmd } from "@/lib/timesheet/dates";
import type { WeekRow } from "@/lib/timesheet/types";
import { decideWeekAction, getWeekDetailAction } from "./actions";
import ConfirmAction from "./ConfirmAction";
import ResultMessage, { type Result } from "./ResultMessage";

export type WeekRowData = {
  userId: string;
  name: string;
  email: string;
  isSelf: boolean;
  weekId: string | null;
  status: "draft" | "sent_back" | "submitted" | "approved" | null;
  total: number;
};

type Detail = { state: "loading" } | { state: "error"; error: string } | { state: "ready"; rows: WeekRow[] };

const STATUS_LABEL = { draft: "Draft", sent_back: "Sent back", submitted: "Submitted", approved: "Approved" } as const;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export default function WeeksTable({ rows, weekStart }: { rows: WeekRowData[]; weekStart: string }) {
  const [open, setOpen] = useState<Record<string, Detail | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  async function toggle(row: WeekRowData) {
    if (!row.weekId) return;
    if (open[row.userId]) {
      setOpen((o) => ({ ...o, [row.userId]: undefined }));
      return;
    }
    setOpen((o) => ({ ...o, [row.userId]: { state: "loading" } }));
    const res = await getWeekDetailAction(row.weekId);
    setOpen((o) => ({
      ...o,
      [row.userId]: res.ok ? { state: "ready", rows: res.rows } : { state: "error", error: res.error },
    }));
  }

  async function decide(row: WeekRowData, decision: "approved" | "draft") {
    if (!row.weekId) return;
    setBusy(row.userId);
    setResult(null);
    const res = await decideWeekAction(row.weekId, decision);
    setBusy(null);
    setResult(
      res.ok
        ? { ok: true, text: `${row.name}'s timesheet was ${decision === "approved" ? "approved" : "sent back"}.` }
        : { ok: false, text: res.error }
    );
  }

  return (
    <>
      <ResultMessage result={result} />
      <div className="ts-sheet-scroll" tabIndex={0} role="region" aria-label="Timesheets, scrolls sideways">
        <table className="ts-atable">
          <caption className="ts-sr-only">One row per employee for this week</caption>
          <thead>
            <tr>
              <th scope="col" className="ts-afirst">
                Employee
              </th>
              <th scope="col" className="ts-anum">
                Hours
              </th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const detail = open[row.userId];
              const expanded = !!detail;
              const working = busy === row.userId;
              return (
                <Fragment key={row.userId}>
                  <tr
                    className={row.weekId ? "is-clickable" : undefined}
                    onClick={() => void toggle(row)}
                  >
                    <th scope="row" className="ts-afirst">
                      {row.weekId ? (
                        <button
                          type="button"
                          className="ts-expander"
                          aria-expanded={expanded}
                          aria-controls={`detail-${row.userId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggle(row);
                          }}
                        >
                          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                          <span>
                            <span className="ts-aname">{row.name}</span>
                            <span className="ts-asub">{row.email}</span>
                          </span>
                        </button>
                      ) : (
                        <span className="ts-expander ts-noexpand">
                          <span aria-hidden="true" />
                          <span>
                            <span className="ts-aname">{row.name}</span>
                            <span className="ts-asub">{row.email}</span>
                          </span>
                        </span>
                      )}
                    </th>
                    <td className="ts-anum">{fmt(row.total)} h</td>
                    <td>
                      {row.status ? (
                        <span className={`ts-chip ts-chip-${row.status === "sent_back" ? "draft" : row.status}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      ) : (
                        <span className="ts-muted">No timesheet</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="ts-actions-cell">
                        {row.status === "submitted" && row.isSelf && (
                          <span className="ts-small ts-muted">Your own timesheet. Another admin decides.</span>
                        )}
                        {row.status === "submitted" && !row.isSelf && (
                          <>
                            <button
                              type="button"
                              className="ts-btn ts-btn-sm"
                              onClick={() => void decide(row, "approved")}
                              disabled={working}
                              aria-label={`Approve ${row.name}'s timesheet`}
                            >
                              {working ? "Working..." : "Approve"}
                            </button>
                            <ConfirmAction
                              label="Send back"
                              question="Send this timesheet back?"
                              confirmLabel="Yes, send back"
                              disabled={working}
                              onConfirm={() => decide(row, "draft")}
                            />
                          </>
                        )}
                        {row.status === "approved" && !row.isSelf && (
                          <ConfirmAction
                            label="Send back"
                            question="Send this timesheet back?"
                            confirmLabel="Yes, send back"
                            disabled={working}
                            onConfirm={() => decide(row, "draft")}
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr id={`detail-${row.userId}`} className="ts-detail-row">
                      <td colSpan={4}>
                        {detail.state === "loading" && <p className="ts-muted">Loading…</p>}
                        {detail.state === "error" && (
                          <p className="ts-alert" role="alert">
                            {detail.error}
                          </p>
                        )}
                        {detail.state === "ready" && (
                          <DetailTable rows={detail.rows} weekStart={weekStart} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DetailTable({ rows, weekStart }: { rows: WeekRow[]; weekStart: string }) {
  if (rows.length === 0) return <p className="ts-muted">No project rows in this week.</p>;
  return (
    <table className="ts-dtable">
      <thead>
        <tr>
          <th scope="col">Project</th>
          {DAY_SHORT.map((d, i) => (
            <th key={d} scope="col" className={i >= 5 ? "is-weekend" : undefined}>
              {d}
              <span className="ts-asub">{formatYmd(addDays(weekStart, i), { day: "numeric", month: "short" })}</span>
            </th>
          ))}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const total = DAY_KEYS.reduce((s, k) => s + r[k], 0);
          return (
            <tr key={r.id}>
              <th scope="row">{r.project || "(no project)"}</th>
              {DAY_KEYS.map((k, i) => (
                <td key={k} className={i >= 5 ? "is-weekend" : undefined}>
                  {r[k] > 0 ? fmt(r[k]) : "–"}
                </td>
              ))}
              <td>
                <strong>{fmt(total)}</strong>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
