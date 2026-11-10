"use client";

import { useState, useTransition } from "react";
import { FormField, Textarea } from "../../_components/Fields";
import { addAllowedEmailsAction, removeAllowedEmailAction } from "./actions";

export function AddEmailsForm() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await addAllowedEmailsAction(text);
      if (!result.ok) return setError(result.error);
      setText("");
      setDone(result.added === 1 ? "1 email added." : `${result.added} emails added.`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="ts-form">
      <FormField
        label="Add emails"
        hint="Separate several addresses with commas, spaces or new lines. Only @vyntics.com addresses work."
      >
        <Textarea
          name="emails"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          placeholder="name@vyntics.com, another@vyntics.com"
        />
      </FormField>
      <div aria-live="polite">
        {error && (
          <p className="ts-alert" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="ts-success" role="status">
            {done}
          </p>
        )}
      </div>
      <div>
        <button type="submit" className="ts-btn" disabled={pending || text.trim() === ""}>
          {pending ? "Adding..." : "Add to the list"}
        </button>
      </div>
    </form>
  );
}

export function RemoveEmailButton({ email }: { email: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeAllowedEmailAction(email);
      if (!result.ok) {
        setError(result.error);
        setAsking(false);
      }
    });
  }

  return (
    <span className="ts-delete">
      {asking ? (
        <span role="group" aria-label={`Remove ${email}?`} className="ts-confirm">
          <span className="ts-small">Remove this email?</span>
          <button type="button" className="ts-btn ts-btn-danger ts-btn-sm" onClick={remove} disabled={pending}>
            {pending ? "Removing..." : "Yes, remove"}
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
      ) : (
        <button
          type="button"
          className="ts-btn ts-btn-ghost ts-btn-sm"
          onClick={() => setAsking(true)}
          aria-label={`Remove ${email}`}
        >
          Remove
        </button>
      )}
      <span role="alert" className="ts-inline-error">
        {error}
      </span>
    </span>
  );
}
