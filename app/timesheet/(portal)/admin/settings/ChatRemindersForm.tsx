"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TEMPLATE, TEMPLATE_MAX, renderTemplate, validateChatSettings, type ChatSettings } from "@/lib/reminders/core";
import { saveChatSettingsAction } from "./chatActions";

// Google Chat reminders: on or off, when, and what the message says. Nothing is sent until an admin turns it on.
export function ChatRemindersForm({ saved, connected, ready }: { saved: ChatSettings; connected: boolean; ready: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<ChatSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = validateChatSettings(s);
  const dirty = JSON.stringify({ ...s, template: s.template.trim() }) !== JSON.stringify({ ...saved, template: saved.template.trim() });
  const set = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => setS((p) => ({ ...p, [key]: value }));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveChatSettingsAction(s);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return void toast.error(res.error);
    }
    toast.success("Chat reminder settings saved.");
    router.refresh();
  }

  return (
    <section aria-labelledby="chat-reminders" className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="chat-reminders" className="text-base font-semibold">
          Google Chat reminders
        </h2>
      </div>
      {!ready && (
        <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Not set up yet. Run <code>supabase/step33_chat_reminders.sql</code> in Supabase, then reload this page.
        </p>
      )}
      {ready && !connected && (
        <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Google Chat isn&apos;t connected on the server (<code>GOOGLE_CHAT_WEBHOOK_URL</code> is missing), so nothing can be sent yet.
        </p>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <Label htmlFor="chat-on">Send reminders</Label>
          <p className="text-xs text-muted-foreground">
            On working days, each person who has logged less than the daily target gets a card in the team Chat space naming them, with their hours and an &ldquo;Add time log&rdquo; button. Everyone in that space can see the messages. People on approved leave, weekly offs and holidays are skipped, and
            everyone can switch it off for themselves on their profile.
          </p>
        </div>
        <Switch id="chat-on" checked={s.enabled} disabled={busy || !ready} onCheckedChange={(v) => set("enabled", v)} aria-label="Send Google Chat reminders" />
      </div>

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="chat-time">Reminder time (India time)</Label>
        <Input id="chat-time" type="time" value={s.reminderTime} disabled={busy || !ready} onChange={(e) => set("reminderTime", e.target.value)} className="w-40 max-md:h-11" />
        <p className="text-xs text-muted-foreground">The reminder is never sent before this time. The scheduled job runs once each weekday at about 5:30 PM (on the free Vercel plan it can start up to an hour later), so choose 5:30 PM or earlier.</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="chat-template">Message</Label>
        <Textarea id="chat-template" rows={3} value={s.template} maxLength={TEMPLATE_MAX} disabled={busy || !ready} onChange={(e) => set("template", e.target.value)} />
        <p className="text-xs text-muted-foreground">
          You can use <code>{"{name}"}</code>, <code>{"{hours}"}</code>, <code>{"{target}"}</code> and <code>{"{remaining}"}</code>.
        </p>
        <p className="rounded-md bg-muted/50 p-2 text-sm">
          <span className="text-xs text-muted-foreground">Preview: </span>
          {renderTemplate(s.template || DEFAULT_TEMPLATE, { name: "Asha", hours: 5.5, target: 8 })}
        </p>
        <Button type="button" variant="ghost" size="sm" className="w-fit" disabled={busy || !ready} onClick={() => set("template", DEFAULT_TEMPLATE)}>
          Use the standard message
        </Button>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="chat-summary" className="font-normal">
            Friday summary: hours logged this week against the weekly target
          </Label>
          <Switch id="chat-summary" checked={s.weeklySummary} disabled={busy || !ready} onCheckedChange={(v) => set("weeklySummary", v)} />
        </div>
      </div>

      {(error || (dirty && problem)) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error ?? problem}
        </p>
      )}
      <div>
        <Button type="button" className="max-md:min-h-11" disabled={busy || !ready || !dirty || !!problem} onClick={save}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Save Chat settings
        </Button>
      </div>
    </section>
  );
}
