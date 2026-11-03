"use client";

import { useState, useTransition } from "react";
import { cancelRequestAction } from "./actions";

export default function CancelButton({ id, label }: { id: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await cancelRequestAction(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        className="ts-btn ts-btn-ghost ts-btn-sm"
        onClick={onClick}
        disabled={pending}
        aria-label={`Cancel ${label}`}
      >
        {pending ? "Cancelling..." : "Cancel"}
      </button>
      <span role="alert" className="ts-inline-error">
        {error}
      </span>
    </>
  );
}
