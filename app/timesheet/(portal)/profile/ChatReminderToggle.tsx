"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setChatRemindersAction } from "./chatActions";

// "Remind me on Google Chat": your own switch. Saves as soon as it is flipped.
export function ChatReminderToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setBusy(true);
    const res = await setChatRemindersAction(next);
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      return void toast.error(res.error);
    }
    toast.success(next ? "Chat reminders are on." : "Chat reminders are off.");
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor="chat-optin">Google Chat reminders</Label>
        <p className="text-xs text-muted-foreground">A card in the team Chat space naming you when you haven&apos;t logged a full day, a Friday summary, and (for managers and admins) approvals waiting.</p>
      </div>
      <Switch id="chat-optin" checked={on} disabled={busy} onCheckedChange={change} aria-label="Send me Google Chat reminders" />
    </div>
  );
}
