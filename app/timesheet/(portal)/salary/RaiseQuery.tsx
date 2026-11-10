"use client";

import { MessageSquare } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { raiseQueryAction } from "./actions";

const TOPICS = ["The net pay looks wrong", "Leave or loss of pay days", "Overtime or holiday work", "A deduction", "Something else"];

export default function RaiseQuery({ payslipId, monthLabel }: { payslipId: string; monthLabel: string }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) return setError("Write your question.");
    startTransition(async () => {
      const res = await raiseQueryAction(payslipId, topic, message);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Your query was sent to payroll.");
      setMessage("");
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquare aria-hidden="true" /> Raise a query
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Raise a query about {monthLabel}</DialogTitle>
              <DialogDescription>Payroll will see this and reply here. Please don&apos;t put your amounts in the message; they can already see them.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="q-topic">Topic</Label>
              <Select value={topic} onValueChange={setTopic} disabled={pending}>
                <SelectTrigger id="q-topic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOPICS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-message">
                Your question <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Textarea id="q-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} aria-invalid={!!error} disabled={pending} />
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending..." : "Send query"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
