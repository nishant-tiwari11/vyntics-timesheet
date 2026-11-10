"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { disconnectGoogleAction, syncMyRequestsAction } from "./googleActions";

const FLASH: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected." },
  denied: { ok: false, text: "You didn't allow access, so nothing was connected." },
  error: { ok: false, text: "Couldn't connect to Google. Please try again." },
  unconfigured: { ok: false, text: "Google Calendar isn't set up yet. Ask an admin to add the Google keys." },
  no_refresh: {
    ok: false,
    text: "Google didn't give lasting access. Remove Vyntics at myaccount.google.com/permissions, then connect again.",
  },
};

export default function GoogleCalendarCard({
  configured,
  connected,
  show,
  month,
  error,
  flash,
}: {
  configured: boolean;
  connected: boolean;
  show: boolean;
  /** The month on screen, "YYYY-MM", so toggling keeps you on it. */
  month: string;
  /** Set when loading the Google events failed. */
  error: string | null;
  /** The ?google= result of the connect flow. */
  flash: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  // Tell the person how connecting went, then tidy the address bar.
  useEffect(() => {
    if (!flash) return;
    const f = FLASH[flash];
    if (f) (f.ok ? toast.success : toast.error)(f.text);
    router.replace(`/timesheet/calendar?month=${month}${show ? "&gcal=1" : ""}`, { scroll: false });
  }, [flash, month, show, router]);

  // Loading the events failed: say so, with a retry.
  useEffect(() => {
    if (!error) return;
    toast.error(error, { id: "google-events-error", action: { label: "Retry", onClick: () => router.refresh() } });
  }, [error, router]);

  function toggle(on: boolean) {
    router.replace(`/timesheet/calendar?month=${month}${on ? "&gcal=1" : ""}`, { scroll: false });
  }

  function sync() {
    startTransition(async () => {
      const res = await syncMyRequestsAction();
      if (res.ok) toast.success(res.message ?? "Synced.");
      else toast.error(res.error, { action: { label: "Retry", onClick: sync } });
    });
  }

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectGoogleAction();
      setConfirming(false);
      if (res.ok) toast.success("Google Calendar disconnected.");
      else toast.error(res.error, { action: { label: "Retry", onClick: disconnect } });
    });
  }

  return (
    <Card className="shadow-none" aria-label="Google Calendar">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">Google Calendar</CardTitle>
          <Badge variant="outline" className={connected ? "" : "text-muted-foreground"}>
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <CardDescription>
          Approved leave and work from home are added to your Google Calendar as all-day events. Only the type and the
          dates are shared (&quot;Leave&quot; or &quot;WFH&quot;), never your reason. We ask for permission to manage events only,
          and you can disconnect at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {!connected ? (
          configured ? (
            <Button asChild>
              {/* A plain link: this address redirects to Google, so the router must not prefetch it. */}
              <a href="/timesheet/google/connect">Connect Google Calendar</a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not set up yet. An admin needs to add the Google keys (see .env.example).
            </p>
          )
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Switch id="show-google" checked={show} onCheckedChange={toggle} />
              <Label htmlFor="show-google">Show Google events</Label>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={sync} disabled={busy}>
              {busy ? "Working..." : "Sync my approved leave / WFH"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
              Disconnect
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Calendar?</DialogTitle>
            <DialogDescription>
              New leave and WFH will no longer be added. Events already in your Google Calendar stay there.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={disconnect} disabled={busy}>
              {busy ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
