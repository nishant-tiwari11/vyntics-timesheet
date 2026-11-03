"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, formatYmd } from "@/lib/timesheet/dates";
import { PROJECTS } from "@/lib/timesheet/projects";
import { deleteRowAction, reopenWeekAction, saveRowAction, submitWeekAction } from "./actions";

const TARGET = 40;
const DEBOUNCE_MS = 600;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CONFLICT_MESSAGE =
  "This week was changed somewhere else (for example, an admin approved it), so your last change wasn't saved. Showing the latest version.";

type Status = "draft" | "sent_back" | "submitted" | "approved";
type RowState = "idle" | "dirty" | "saving" | "saved" | "error" | "invalid";
type Row = { key: string; id: string | null; project: string; days: string[]; state: RowState; error?: string };
export type DayTag = { type: "leave" | "wfh"; pending: boolean };

type Props = {
  weekStart: string;
  today: string;
  thisMonday: string;
  weekId: string | null;
  status: Status;
  rows: { id: string; project: string; days: number[] }[];
  tags: (DayTag | null)[] | null;
  signature: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(round2(n));

/** "" means 0. Returns NaN for anything that isn't a number from 0 to 24. */
function parseCell(s: string): number {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : NaN;
}
const num = (s: string) => {
  const n = parseCell(s);
  return Number.isNaN(n) ? 0 : n;
};

let keyCounter = 0;
const newKey = () => `row-${Date.now()}-${keyCounter++}`;

function fromServer(rows: Props["rows"]): Row[] {
  return rows.map((r) => ({
    key: r.id,
    id: r.id,
    project: r.project,
    days: r.days.map((d) => (d === 0 ? "" : String(d))),
    state: "idle",
  }));
}

/** Why a row can't be saved right now, or null if it can. */
function problem(rows: Row[], key: string): string | null {
  const row = rows.find((r) => r.key === key);
  if (!row) return null;
  if (row.days.some((d) => Number.isNaN(parseCell(d)))) return "Hours must be between 0 and 24.";
  for (let i = 0; i < 7; i++) {
    if (rows.reduce((sum, r) => sum + num(r.days[i]), 0) > 24) return "A day can't have more than 24 hours.";
  }
  return null;
}

export default function TimesheetEditor(props: Props) {
  const { weekStart, today, thisMonday, tags } = props;
  const router = useRouter();

  const [status, setStatus] = useState<Status>(props.status);
  const [rows, setRows] = useState<Row[]>(() => fromServer(props.rows));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"submit" | "reopen" | null>(null);

  const rowsRef = useRef(rows);
  const weekIdRef = useRef(props.weekId);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const dirty = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const signatureRef = useRef(props.signature);

  const locked = status === "submitted" || status === "approved";

  function commit(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
  }
  function patch(key: string, changes: Partial<Row>) {
    commit(rowsRef.current.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  // ---------- Server data changed (after router.refresh): load it ----------
  useEffect(() => {
    if (signatureRef.current === props.signature) return;
    signatureRef.current = props.signature;
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    dirty.current.clear();
    removed.current.clear();
    weekIdRef.current = props.weekId;
    setStatus(props.status);
    commit(fromServer(props.rows));
  }, [props.signature, props.weekId, props.status, props.rows]);

  // ---------- Warn before leaving with unsaved changes ----------
  const unsaved = rows.some((r) => r.state === "dirty" || r.state === "saving" || r.state === "error" || r.state === "invalid");
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  // Leaving by an in-app link: save whatever is waiting on the debounce.
  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      for (const [key, t] of pendingTimers) {
        clearTimeout(t);
        void persist(key);
      }
      pendingTimers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Saving ----------
  function handleConflict() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    dirty.current.clear();
    setNotice(CONFLICT_MESSAGE);
    router.refresh();
  }

  function persist(key: string): Promise<void> {
    const running = inflight.current.get(key);
    if (running) {
      dirty.current.add(key); // edited while saving: save again afterwards
      return running;
    }
    const job = (async () => {
      do {
        dirty.current.delete(key);
        const row = rowsRef.current.find((r) => r.key === key);
        if (!row) return;
        patch(key, { state: "saving", error: undefined });
        const days = Object.fromEntries(
          ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((k, i) => [k, num(row.days[i])])
        );
        const res = await saveRowAction({
          weekStart,
          weekId: weekIdRef.current,
          rowId: row.id,
          project: row.project,
          days,
          position: rowsRef.current.findIndex((r) => r.key === key),
        });
        if (!res.ok) {
          if (res.code === "conflict") handleConflict();
          else patch(key, { state: "error", error: res.error });
          return;
        }
        weekIdRef.current = res.weekId;
        if (removed.current.has(key)) {
          await deleteRowAction(res.rowId); // the row was removed while it was saving
          return;
        }
        patch(key, { id: res.rowId });
        if (!dirty.current.has(key) && !timers.current.has(key)) patch(key, { state: "saved" });
      } while (dirty.current.has(key));
    })().finally(() => {
      inflight.current.delete(key);
    });
    inflight.current.set(key, job);
    return job;
  }

  function schedule(key: string, delay = DEBOUNCE_MS) {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        void persist(key);
      }, delay)
    );
  }

  /** After any edit: re-check rows that couldn't be saved, and queue the ones that can. */
  function afterEdit(next: Row[], editedKey: string) {
    let firstProblem: string | null = null;
    const updated = next.map((r) => {
      if (r.key !== editedKey && r.state !== "invalid") return r;
      const err = problem(next, r.key);
      if (err) {
        firstProblem ??= err;
        const t = timers.current.get(r.key);
        if (t) clearTimeout(t);
        timers.current.delete(r.key);
        return { ...r, state: "invalid" as const, error: err };
      }
      return { ...r, state: "dirty" as const, error: undefined };
    });
    commit(updated);
    setNotice(firstProblem);
    updated.forEach((r) => {
      if (r.state === "dirty" && (r.key === editedKey || next.find((n) => n.key === r.key)?.state === "invalid")) {
        schedule(r.key);
      }
    });
  }

  function onHours(key: string, day: number, value: string) {
    const next = rowsRef.current.map((r) =>
      r.key === key ? { ...r, days: r.days.map((d, i) => (i === day ? value : d)) } : r
    );
    afterEdit(next, key);
  }

  function onProject(key: string, value: string) {
    if (rowsRef.current.some((r) => r.key !== key && r.project === value)) {
      setNotice("That project is already in this week.");
      return; // the dropdown stays on the old value
    }
    const next = rowsRef.current.map((r) => (r.key === key ? { ...r, project: value } : r));
    afterEdit(next, key);
  }

  function addRow() {
    const used = new Set(rowsRef.current.map((r) => r.project));
    const project = PROJECTS.find((p) => !used.has(p));
    if (!project) return;
    const key = newKey();
    commit([...rowsRef.current, { key, id: null, project, days: Array(7).fill(""), state: "dirty" }]);
    setNotice(null);
    void persist(key); // adding a row counts as the first change: the week is created now
  }

  async function removeRow(key: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return;
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    dirty.current.delete(key);
    removed.current.add(key);
    commit(rowsRef.current.filter((r) => r.key !== key));
    setNotice(null);
    if (inflight.current.has(key) || !row.id) return; // persist() deletes it once saving ends

    const res = await deleteRowAction(row.id);
    if (!res.ok) {
      removed.current.delete(key);
      if (res.code === "conflict") return handleConflict();
      commit([...rowsRef.current, { ...row, state: "idle" }]);
      setNotice(res.error);
    }
  }

  async function flushAll(): Promise<boolean> {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    const waiting = rowsRef.current.filter((r) => r.state === "dirty" || r.state === "error").map((r) => r.key);
    await Promise.all(waiting.map((k) => persist(k)));
    await Promise.all([...inflight.current.values()]);
    return rowsRef.current.every((r) => r.state === "saved" || r.state === "idle");
  }

  function retry() {
    setNotice(null);
    rowsRef.current.filter((r) => r.state === "error").forEach((r) => void persist(r.key));
  }

  // ---------- Totals ----------
  const rowTotals = rows.map((r) => round2(r.days.reduce((s, d) => s + num(d), 0)));
  const dayTotals = DAY_NAMES.map((_, i) => round2(rows.reduce((s, r) => s + num(r.days[i]), 0)));
  const grand = round2(dayTotals.reduce((a, b) => a + b, 0));
  const remaining = round2(TARGET - grand);
  const usedProjects = new Set(rows.map((r) => r.project));
  const canAdd = !locked && PROJECTS.some((p) => !usedProjects.has(p));

  const future = weekStart > thisMonday;
  const submitBlock = future
    ? "You can't submit a week that hasn't started yet."
    : grand <= 0
      ? "Add some hours to submit this week."
      : null;

  // ---------- Save status text ----------
  const anySaving = rows.some((r) => r.state === "dirty" || r.state === "saving");
  const anyError = rows.some((r) => r.state === "error");
  const anyInvalid = rows.some((r) => r.state === "invalid");
  const anySaved = rows.some((r) => r.state === "saved");
  const saveText = locked
    ? ""
    : anySaving
      ? "Saving…"
      : anyError
        ? "Couldn't save. Check your connection and try again."
        : anyInvalid
          ? "Not saved yet. Fix the highlighted hours."
          : anySaved
            ? "Saved"
            : "";

  // ---------- Submit / reopen ----------
  async function openSubmit() {
    setNotice(null);
    setBusy("submit");
    const ok = await flushAll();
    setBusy(null);
    if (!ok) {
      setNotice("Some changes aren't saved yet. Fix them before submitting.");
      return;
    }
    dialogRef.current?.showModal();
  }

  async function confirmSubmit() {
    if (!weekIdRef.current) return;
    setBusy("submit");
    const res = await submitWeekAction(weekIdRef.current);
    dialogRef.current?.close();
    setBusy(null);
    if (res.ok) {
      setStatus("submitted");
      setNotice(null);
    } else if (res.code === "conflict") {
      handleConflict();
    } else {
      setNotice(res.error);
    }
  }

  async function reopen() {
    if (!weekIdRef.current) return;
    setBusy("reopen");
    const res = await reopenWeekAction(weekIdRef.current);
    setBusy(null);
    if (res.ok) {
      setStatus("draft");
      setNotice(null);
    } else if (res.code === "conflict") {
      handleConflict();
    } else {
      setNotice(res.error);
    }
  }

  const statusLabel = { draft: "Draft", sent_back: "Sent back", submitted: "Submitted", approved: "Approved" }[status];
  const statusText =
    status === "submitted"
      ? "This week is locked. Reopen it to make changes."
      : status === "approved"
        ? "An admin approved this week. It is locked."
        : "Changes save automatically.";

  return (
    <>
      <div className="ts-sheet-status">
        <span className={`ts-chip ts-chip-${status === "sent_back" ? "draft" : status}`}>{statusLabel}</span>
        <span>{statusText}</span>
      </div>

      <section className="ts-card ts-sheet-card" aria-label="Timesheet">
        <div className="ts-sheet-scroll" tabIndex={0} role="region" aria-label="Timesheet table, scrolls sideways">
          <table className="ts-sheet">
            <caption className="ts-sr-only">Hours per project for each day of the week</caption>
            <thead>
              <tr>
                <th scope="col" className="ts-col-project">
                  Project
                </th>
                {DAY_SHORT.map((d, i) => {
                  const date = addDays(weekStart, i);
                  const tag = tags?.[i];
                  return (
                    <th
                      key={d}
                      scope="col"
                      className={`ts-col-day${i >= 5 ? " is-weekend" : ""}${date === today ? " is-today" : ""}`}
                    >
                      <span className="ts-th-name">{d}</span>
                      <span className="ts-th-date">{formatYmd(date, { day: "numeric", month: "short" })}</span>
                      <span className="ts-th-tag">
                        {tag && (
                          <span
                            className={`ts-tag ts-tag-${tag.type}${tag.pending ? " is-pending" : ""}`}
                            title={tag.pending ? "Pending approval" : undefined}
                          >
                            {tag.type === "leave" ? "Leave" : "WFH"}
                            <span className="ts-sr-only">{tag.pending ? " (pending approval)" : ""}</span>
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
                <th scope="col" className="ts-col-total">
                  Total
                </th>
                <th scope="col" className="ts-col-remove">
                  <span className="ts-sr-only">Remove row</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="ts-sheet-empty">
                    No projects yet. {locked ? "Nothing was logged this week." : "Add a project row to start."}
                  </td>
                </tr>
              )}
              {rows.map((row, ri) => (
                <tr key={row.key} className={row.state === "invalid" || row.state === "error" ? "has-problem" : undefined}>
                  <th scope="row" className="ts-col-project">
                    <select
                      className="ts-input ts-select"
                      aria-label={`Project for row ${ri + 1}`}
                      value={row.project}
                      onChange={(e) => onProject(row.key, e.target.value)}
                      disabled={locked}
                    >
                      {!(PROJECTS as readonly string[]).includes(row.project) && (
                        <option value={row.project}>{row.project || "Choose a project"}</option>
                      )}
                      {PROJECTS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </th>
                  {row.days.map((value, di) => (
                    <td key={di} className={di >= 5 ? "is-weekend" : undefined}>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="ts-input ts-hours"
                        min={0}
                        max={24}
                        step={0.25}
                        value={value}
                        placeholder="0"
                        aria-label={`${row.project}, ${DAY_NAMES[di]}`}
                        aria-invalid={Number.isNaN(parseCell(value)) || (row.state === "invalid" && dayTotals[di] > 24)}
                        onChange={(e) => onHours(row.key, di, e.target.value)}
                        disabled={locked}
                      />
                    </td>
                  ))}
                  <td className="ts-col-total">{fmt(rowTotals[ri])}</td>
                  <td className="ts-col-remove">
                    {!locked && (
                      <button
                        type="button"
                        className="ts-icon-remove"
                        onClick={() => void removeRow(row.key)}
                        aria-label={`Remove ${row.project} row`}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="ts-col-project">
                  Daily total
                </th>
                {dayTotals.map((t, i) => (
                  <td key={i} className={`${i >= 5 ? "is-weekend" : ""}${t > 24 ? " is-over" : ""}`}>
                    {fmt(t)}
                  </td>
                ))}
                <td className="ts-col-total ts-grand">{fmt(grand)}</td>
                <td className="ts-col-remove" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="ts-target">
          {remaining > 0 ? `${fmt(remaining)} h to reach the ${TARGET} h target.` : `Target of ${TARGET} h reached.`}
        </p>

        <div className="ts-save-line">
          <span role="status" aria-live="polite" className={anyError ? "ts-save-error" : "ts-muted"}>
            {saveText}
          </span>
          {anyError && (
            <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={retry}>
              Retry
            </button>
          )}
        </div>

        <div aria-live="assertive">
          {notice && (
            <p className="ts-alert" role="alert">
              {notice}
            </p>
          )}
        </div>

        <div className="ts-sheet-actions">
          <div>
            {canAdd && (
              <button type="button" className="ts-btn ts-btn-ghost" onClick={addRow}>
                + Add project row
              </button>
            )}
          </div>
          <div className="ts-sheet-actions-right">
            {status === "submitted" && (
              <button type="button" className="ts-btn ts-btn-ghost" onClick={reopen} disabled={busy !== null}>
                {busy === "reopen" ? "Reopening..." : "Reopen week"}
              </button>
            )}
            {!locked && (
              <>
                {submitBlock && (
                  <span id="submit-block" className="ts-small ts-muted">
                    {submitBlock}
                  </span>
                )}
                <button
                  type="button"
                  className="ts-btn"
                  onClick={openSubmit}
                  disabled={busy !== null || submitBlock !== null}
                  aria-describedby={submitBlock ? "submit-block" : undefined}
                >
                  {busy === "submit" ? "Submitting..." : "Submit week"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <dialog ref={dialogRef} className="ts-dialog" aria-labelledby="submit-title">
        <h2 id="submit-title" className="ts-dialog-title">
          Submit this week?
        </h2>
        <p>
          You logged {fmt(grand)} h of {TARGET} h. You can reopen it until an admin approves it.
        </p>
        <div className="ts-dialog-actions">
          <button type="button" className="ts-btn ts-btn-ghost" onClick={() => dialogRef.current?.close()} disabled={busy === "submit"} autoFocus>
            Cancel
          </button>
          <button type="button" className="ts-btn" onClick={confirmSubmit} disabled={busy === "submit"}>
            {busy === "submit" ? "Submitting..." : "Submit week"}
          </button>
        </div>
      </dialog>
    </>
  );
}
