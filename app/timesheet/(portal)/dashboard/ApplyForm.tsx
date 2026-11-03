"use client";

import { useState, useTransition } from "react";
import { daysInclusive } from "@/lib/timesheet/dates";
import { createRequestAction } from "./actions";

const REASON_MAX = 120;

export default function ApplyForm({ today }: { today: string }) {
  const [type, setType] = useState<"leave" | "wfh">("leave");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const days = from && to && to >= from ? daysInclusive(from, to) : 0;

  function onFromChange(value: string) {
    setFrom(value);
    if (value && to < value) setTo(value); // "To" can never be before "From"
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!from || !to) return setError("Please choose both dates.");
    if (from < today) return setError("The start date can't be in the past.");
    if (to < from) return setError("The end date can't be before the start date.");

    startTransition(async () => {
      const result = await createRequestAction({ type, from, to, note });
      if (result.ok) {
        setSuccess(true);
        setNote("");
        setFrom(today);
        setTo(today);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="ts-form">
      <div className="ts-field" role="radiogroup" aria-label="Request type">
        <span className="ts-label">Type</span>
        <div className="ts-segment">
          {(
            [
              ["leave", "Leave"],
              ["wfh", "Work from home"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              className="ts-segment-btn"
              onClick={() => setType(value)}
              disabled={pending}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ts-row-2">
        <div className="ts-field">
          <label htmlFor="req-from">From</label>
          <input
            id="req-from"
            type="date"
            className="ts-input"
            value={from}
            min={today}
            onChange={(e) => onFromChange(e.target.value)}
            disabled={pending}
            required
          />
        </div>
        <div className="ts-field">
          <label htmlFor="req-to">To</label>
          <input
            id="req-to"
            type="date"
            className="ts-input"
            value={to}
            min={from || today}
            onChange={(e) => setTo(e.target.value)}
            disabled={pending}
            required
          />
        </div>
      </div>

      <p className="ts-hint" aria-live="polite">
        {days > 0 ? `${days} ${days === 1 ? "day" : "days"} (counts weekends too)` : "Choose valid dates."}
      </p>

      <div className="ts-field">
        <label htmlFor="req-reason">
          Reason <span className="ts-muted">(optional)</span>
        </label>
        <input
          id="req-reason"
          type="text"
          className="ts-input"
          maxLength={REASON_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          aria-describedby="req-reason-count"
          placeholder="e.g. Family event"
        />
        <p id="req-reason-count" className="ts-hint">
          {note.length}/{REASON_MAX}
        </p>
      </div>

      <div aria-live="polite">
        {error && (
          <p className="ts-alert" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="ts-success" role="status">
            Request sent. Your admin will review it.
          </p>
        )}
      </div>

      <button type="submit" className="ts-btn ts-btn-block" disabled={pending}>
        {pending ? "Sending..." : "Send request"}
      </button>
    </form>
  );
}
