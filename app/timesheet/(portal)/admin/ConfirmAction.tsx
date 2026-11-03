"use client";

import { useState } from "react";

// Two-step button: "Send back" -> "Send back this timesheet?  [Yes, send back] [Keep]".
export default function ConfirmAction({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  danger,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    await onConfirm();
    setPending(false);
    setAsking(false);
  }

  if (!asking) {
    return (
      <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </button>
    );
  }
  return (
    <span role="group" aria-label={question} className="ts-confirm">
      <span className="ts-small">{question}</span>
      <button
        type="button"
        className={`ts-btn ts-btn-sm${danger ? " ts-btn-danger" : ""}`}
        onClick={confirm}
        disabled={pending}
      >
        {pending ? "Working..." : confirmLabel}
      </button>
      <button
        type="button"
        className="ts-btn ts-btn-ghost ts-btn-sm"
        onClick={() => setAsking(false)}
        disabled={pending}
        autoFocus
      >
        Keep
      </button>
    </span>
  );
}
