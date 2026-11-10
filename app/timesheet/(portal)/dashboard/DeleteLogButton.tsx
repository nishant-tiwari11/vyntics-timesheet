"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminDeleteLogAction } from "../admin/logActions";
import { deleteLogAction } from "./actions";

// Two-step delete: "Delete" → "Delete this entry?  [Yes, delete] [Keep]".
export default function DeleteLogButton({ id, admin = false }: { id: string; admin?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = admin ? await adminDeleteLogAction(id) : await deleteLogAction(id);
      if (!result.ok) {
        toast.error(result.error);
        setError(result.error);
        setAsking(false);
        return;
      }
      toast.success("Time log deleted.");
    });
  }

  return (
    <span className="ts-delete">
      {asking ? (
        <span role="group" aria-label="Confirm delete" className="ts-confirm">
          <span className="ts-small">Delete this entry?</span>
          <button type="button" className="ts-btn ts-btn-danger ts-btn-sm" onClick={confirmDelete} disabled={pending}>
            {pending ? "Deleting..." : "Yes, delete"}
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
        <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => setAsking(true)}>
          Delete
        </button>
      )}
      <span role="alert" className="ts-inline-error">
        {error}
      </span>
    </span>
  );
}
