"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { answerQueryAction } from "../runsActions";

export function AnswerQuery({ id, who, topic, message, status, reply }: { id: string; who: string; topic: string; message: string; status: "open" | "resolved"; reply: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reply);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: "open" | "resolved") {
    setError(null);
    startTransition(async () => {
      const res = await answerQueryAction(id, next, text);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(next === "resolved" ? "Query resolved." : "Reply saved.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant={status === "open" ? "default" : "outline"} onClick={() => setOpen(true)} aria-label={`${status === "open" ? "Answer" : "View"} the query from ${who}`}>
        {status === "open" ? "Answer" : "View"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{topic}</DialogTitle>
            <DialogDescription>From {who}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words rounded-md border p-3 text-sm">{message}</p>
          <div className="grid gap-1.5">
            <Label htmlFor={`reply-${id}`}>Your reply</Label>
            <Textarea id={`reply-${id}`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} disabled={pending} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Close
            </Button>
            {status === "resolved" ? (
              <Button type="button" variant="outline" onClick={() => save("open")} disabled={pending}>
                Reopen query
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => save("open")} disabled={pending || !text.trim()}>
                  Save reply
                </Button>
                <Button type="button" onClick={() => save("resolved")} disabled={pending}>
                  {pending ? "Saving..." : "Resolve"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
