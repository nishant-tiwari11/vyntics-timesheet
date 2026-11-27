"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      setAsking(false);
      toast.success("Time log deleted.");
    });
  }

  // Employees confirm in a small popup, so the row's buttons never jump around. Admin keeps the inline confirm.
  if (!admin) {
    return (
      <span className="ts-delete">
        <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => setAsking(true)}>
          Delete
        </button>
        <Dialog open={asking} onOpenChange={(o) => !pending && setAsking(o)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete this time log?</DialogTitle>
              <DialogDescription>It will be removed from your timesheet. This can&apos;t be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(false)} disabled={pending} autoFocus>
                Keep
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
                {pending ? "Deleting..." : "Yes, delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <span role="alert" className="ts-inline-error">
          {error}
        </span>
      </span>
    );
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
