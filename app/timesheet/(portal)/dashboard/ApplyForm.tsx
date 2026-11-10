"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { daysText } from "@/lib/timesheet/compOffCore";
import { workingDays } from "@/lib/timesheet/dates";
import { FormField, Input, Textarea } from "../../_components/Fields";
import { createRequestAction } from "./actions";

const REASON_MAX = 120;

const TYPES = [
  { value: "leave", label: "Leave", sub: "A day or more off" },
  { value: "wfh", label: "Work from home", sub: "Working remotely" },
  { value: "comp", label: "Comp-off", sub: "Use days you earned" },
] as const;

type Kind = (typeof TYPES)[number]["value"];

export default function ApplyForm({
  today,
  offDays = [],
  compOff = null,
}: {
  today: string;
  offDays?: string[];
  /** Your comp-off balance, or null if it could not be loaded. */
  compOff?: { available: number; expiringSoon: number } | null;
}) {
  const [type, setType] = useState<Kind>("leave");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"from" | "to", string>>>({});
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const days = from && to && to >= from ? workingDays(from, to, offDays) : 0;

  function onFromChange(value: string) {
    setFrom(value);
    setErrors({});
    if (value && to < value) setTo(value); // "To" can never be before "From"
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const found: Partial<Record<"from" | "to", string>> = {};
    if (!from) found.from = "Choose the first day.";
    else if (from < today) found.from = "The start date can't be in the past.";
    if (!to) found.to = "Choose the last day.";
    else if (from && to < from) found.to = "The end date can't be before the start date.";
    if (type === "comp" && !found.from && !found.to) {
      const have = compOff?.available ?? 0;
      if (days === 0) found.to = "Those dates are all weekends or holidays, so there is nothing to take comp-off for.";
      else if (days > have) found.to = `You have ${daysText(have)} of comp-off available, and this request needs ${daysText(days)}.`;
    }
    setErrors(found);
    if (found.from || found.to) return;

    startTransition(async () => {
      const result = await createRequestAction({ type: type === "wfh" ? "wfh" : "leave", compOff: type === "comp", from, to, note });
      if (result.ok) {
        toast.success("Request sent. Your admin will review it.");
        setSuccess(true);
        setNote("");
        setFrom(today);
        setTo(today);
      } else {
        toast.error(result.error);
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="ts-apply">
      <div className="ts-apply-types" role="radiogroup" aria-label="Request type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            className={`ts-apply-type ts-apply-type-${t.value}`}
            onClick={() => setType(t.value)}
            disabled={pending}
          >
            <span className="ts-apply-type-title">{t.label}</span>
            <span className="ts-apply-type-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      {type === "comp" && (
        <p className="ts-hint" role="status">
          {compOff
            ? `You have ${daysText(compOff.available)} of comp-off available${compOff.expiringSoon > 0 ? `, and ${daysText(compOff.expiringSoon)} expires soon` : ""}. Each working day uses one day.`
            : "Couldn't load your comp-off balance. Try again in a moment."}
        </p>
      )}

      <div className="ts-apply-dates">
        <FormField label="From" required error={errors.from}>
          <Input type="date" name="from" value={from} min={today} onChange={(e) => onFromChange(e.target.value)} disabled={pending} />
        </FormField>
        <span className="ts-apply-arrow" aria-hidden="true">
          →
        </span>
        <FormField label="To" required error={errors.to}>
          <Input
            type="date"
            name="to"
            value={to}
            min={from || today}
            onChange={(e) => {
              setTo(e.target.value);
              setErrors((prev) => ({ ...prev, to: undefined }));
            }}
            disabled={pending}
          />
        </FormField>
        <p className="ts-apply-days" aria-live="polite">
          {!from || !to || to < from ? (
            "Choose valid dates"
          ) : days === 0 ? (
            "Days off only"
          ) : (
            <>
              <strong>{days}</strong> working {days === 1 ? "day" : "days"}
            </>
          )}
          <span>Weekends and holidays aren&apos;t counted</span>
        </p>
      </div>

      <FormField
        label={
          <>
            Reason <span className="ts-muted">(optional)</span>
          </>
        }
        hint={
          <span style={{ display: "block", textAlign: "right" }}>
            {note.length}/{REASON_MAX}
          </span>
        }
      >
        <Textarea
          name="note"
          rows={3}
          maxLength={REASON_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          placeholder="e.g. Family event"
        />
      </FormField>

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

      <div className="ts-apply-actions">
        <button type="submit" className="ts-btn" disabled={pending}>
          {pending ? "Sending..." : "Send request"}
        </button>
      </div>
    </form>
  );
}
