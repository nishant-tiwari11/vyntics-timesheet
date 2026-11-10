"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelRequestAction } from "./actions";

export default function CancelButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelRequestAction(id);
      if (!result.ok) {
        toast.error(result.error);
        return setError(result.error);
      }
      toast.success("Request cancelled.");
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        className="ts-btn ts-btn-ghost ts-btn-sm"
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-label={`Cancel ${label}`}
      >
        Cancel
      </button>
      <span role="alert" className="ts-inline-error">
        {error}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>
              {label}. Your admin will no longer see it. You can send a new request at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep request
            </Button>
            <Button type="button" onClick={onConfirm} disabled={pending}>
              {pending ? "Cancelling..." : "Cancel request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
