"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ReviewTarget = { id: string; name: string; decision: "verified" | "rejected" };

/** Send a verify / reject decision. Rejecting needs a reason; the employee is notified with it. */
export async function reviewDocument(id: string, decision: "verified" | "rejected", reason = ""): Promise<string | null> {
  try {
    const res = await fetch(`/api/documents/${id}/verify`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && body.ok ? null : (body.error ?? "Couldn't save the decision. Please try again.");
  } catch {
    return "Couldn't reach the server. Please try again.";
  }
}

// The window for verifying or rejecting one document (shared by the profile's Documents tab and /admin/documents).
export function ReviewDialog({ target, onClose, onDone }: { target: ReviewTarget | null; onClose: () => void; onDone?: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rejecting = target?.decision === "rejected";

  async function submit() {
    if (!target) return;
    if (rejecting && reason.trim().length < 3) return setError("Give a reason, so the employee knows what to fix.");
    setBusy(true);
    setError(null);
    const problem = await reviewDocument(target.id, target.decision, reason);
    setBusy(false);
    if (problem) return setError(problem);
    toast.success(rejecting ? "Document rejected. The employee has been told." : "Document verified.");
    setReason("");
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && (setReason(""), setError(null), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rejecting ? "Reject this document?" : "Verify this document?"}</DialogTitle>
          <DialogDescription>
            {rejecting ? `Tell the employee why "${target?.name}" is being rejected. They will be notified.` : `Mark "${target?.name}" as verified.`}
          </DialogDescription>
        </DialogHeader>
        {rejecting && (
          <div className="grid gap-1.5">
            <Label htmlFor="review-reason">Reason</Label>
            <Textarea id="review-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the photo is blurred, please upload a clear copy." disabled={busy} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => (setReason(""), setError(null), onClose())}>
            Cancel
          </Button>
          <Button type="button" variant={rejecting ? "destructive" : "default"} disabled={busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />} {rejecting ? "Reject" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
