"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PART_LABEL, type DayPart } from "@/lib/timesheet/leaveCore";
import { workingDays } from "@/lib/timesheet/dates";
import { FormField, Input, Textarea } from "../../_components/Fields";
import { createRequestAction } from "./actions";

const REASON_MAX = 120;

const TYPES = [
  { value: "leave", label: "Leave", sub: "A day or more off" },
  { value: "wfh", label: "Work from home", sub: "Working remotely" },
] as const;

type Kind = (typeof TYPES)[number]["value"];

export default function ApplyForm({
  today,
  offDays = [],
  initialType = "leave",
}: {
  /** Which kind the form starts on (the quick actions on the dashboard use this). */
  initialType?: "leave" | "wfh" | "comp";
  today: string;
  offDays?: string[];
  /** No longer used: your admin decides if a leave is paid or comp-off when approving. Kept so older callers still work. */
  compOff?: { available: number; expiringSoon: number } | null;
}) {
  const [type, setType] = useState<Kind>(initialType === "wfh" ? "wfh" : "leave");
  const [part, setPart] = useState<DayPart>("full");
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
    setErrors(found);
    if (found.from || found.to) return;

    startTransition(async () => {
      const result = await createRequestAction({ type, from, to, note, part: type === "leave" && from === to ? part : "full" });
      if (result.ok) {
        toast.success("Request sent. Your admin will review it.");
        setSuccess(true);
        setNote("");
        setPart("full");
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

      {type === "leave" && from && from === to && days > 0 && (
        <div className="ts-apply-types" role="radiogroup" aria-label="Full or half day">
          {(["full", "first_half", "second_half"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={part === p} className="ts-apply-type" onClick={() => setPart(p)} disabled={pending}>
              <span className="ts-apply-type-title">{PART_LABEL[p]}</span>
              <span className="ts-apply-type-sub">{p === "full" ? "The whole day" : p === "first_half" ? "Morning off" : "Afternoon off"}</span>
            </button>
          ))}
        </div>
      )}

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
