"use client";

import { useRef, useState, useTransition } from "react";
import { addLogAction } from "./actions";

const MAX = 500;

export default function WorkLogForm() {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const empty = text.trim().length === 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (empty) return setError("Write a line or two about what you worked on.");

    let value: number | null = null;
    if (hours.trim() !== "") {
      value = Number(hours);
      if (!Number.isFinite(value) || value < 0 || value > 24) {
        return setError("Time spent must be between 0 and 24 hours.");
      }
    }

    startTransition(async () => {
      const result = await addLogAction({ text, hours: value });
      if (result.ok) {
        setText("");
        setHours("");
        setSuccess(true);
        textRef.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="ts-form">
      <div className="ts-field">
        <label htmlFor="log-text">What did you work on today?</label>
        <textarea
          id="log-text"
          ref={textRef}
          className="ts-input ts-textarea"
          rows={4}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          placeholder="e.g. Fixed the invoice export bug and reviewed two pull requests"
          aria-describedby="log-text-help"
        />
        <p id="log-text-help" className="ts-hint ts-hint-row">
          <span>{empty ? "Write a line or two about what you worked on." : " "}</span>
          <span aria-label={`${text.length} of ${MAX} characters`}>
            {text.length}/{MAX}
          </span>
        </p>
      </div>

      <div className="ts-field">
        <label htmlFor="log-hours">
          Time spent, in hours <span className="ts-muted">(optional)</span>
        </label>
        <input
          id="log-hours"
          type="number"
          inputMode="decimal"
          className="ts-input"
          min={0}
          max={24}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={pending}
          placeholder="e.g. 1.5"
        />
      </div>

      <div aria-live="polite">
        {error && (
          <p className="ts-alert" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="ts-success" role="status">
            Added to today&apos;s log.
          </p>
        )}
      </div>

      <button type="submit" className="ts-btn ts-btn-block" disabled={pending || empty}>
        {pending ? "Saving..." : "Add to today’s log"}
      </button>
    </form>
  );
}
