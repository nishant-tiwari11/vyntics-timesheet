"use client";

import { useState, useTransition } from "react";
import { decideLogAction } from "./actions";

// Admin only (the server and the database both check again). Approve or reject someone else's entry.
export default function DecideLogButtons({ id, who }: { id: string; who: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decideLogAction(id, decision);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <span className="ts-decide">
      <button
        type="button"
        className="ts-btn ts-btn-sm"
        onClick={() => decide("approved")}
        disabled={pending}
        aria-label={`Approve entry from ${who}`}
      >
        Approve
      </button>
      <button
        type="button"
        className="ts-btn ts-btn-ghost ts-btn-sm"
        onClick={() => decide("rejected")}
        disabled={pending}
        aria-label={`Reject entry from ${who}`}
      >
        Reject
      </button>
      <span role="alert" className="ts-inline-error">
        {error}
      </span>
    </span>
  );
}
