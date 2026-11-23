"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarDays, Link2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [menu, setMenu] = useState(false);

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

  // Syncing is automatic: approved leave and WFH go to Google when they are approved, and each time you open the calendar
  // (at most once an hour in this browser) anything Google doesn't have yet is added, including what was approved before you
  // connected. It is quiet unless something was added.
  useEffect(() => {
    if (!connected) return;
    const KEY = "ts-gcal-sync";
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (last && Date.now() - last < 3_600_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* private window: just sync this time */
    }
    let live = true;
    syncMyRequestsAction(true).then((res) => {
      if (live && res.ok && res.synced) toast.success(res.message ?? "Added to Google Calendar.");
    });
    return () => {
      live = false;
    };
  }, [connected]);

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectGoogleAction();
      setConfirming(false);
      if (res.ok) toast.success("Google Calendar disconnected.");
      else toast.error(res.error, { action: { label: "Retry", onClick: disconnect } });
    });
  }

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border bg-card px-4 py-2.5" aria-label="Google Calendar">
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-semibold">Google Calendar</h2>
      <Badge variant="outline" className={connected ? "" : "text-muted-foreground"}>
        {connected ? "Connected" : "Not connected"}
      </Badge>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!connected ? (
          configured ? (
            <>
              <span className="text-sm text-muted-foreground max-md:hidden">Add your approved leave and WFH to your own calendar.</span>
              <Button asChild size="sm" className="max-md:min-h-11">
                {/* A plain link: this address redirects to Google, so the router must not prefetch it. */}
                <a href="/timesheet/google/connect">
                  <Link2 aria-hidden="true" /> Connect
                </a>
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Not set up yet. An admin needs to add the Google keys.</span>
          )
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Switch id="show-google" checked={show} onCheckedChange={toggle} />
              <Label htmlFor="show-google" className="text-sm font-normal">
                Show Google events
              </Label>
            </div>
            <Popover open={menu} onOpenChange={setMenu}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="max-md:min-h-11">
                  <Settings2 aria-hidden="true" /> Settings
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-[22rem] max-w-[calc(100vw-2rem)] gap-4">
                <div className="grid gap-1">
                  <p className="text-sm font-semibold">Google Calendar settings</p>
                  <p className="text-xs text-muted-foreground">
                    Approved leave and work from home are added to your Google Calendar as all-day events. Only the type and the dates are shared (&quot;Leave&quot; or &quot;WFH&quot;), never your
                    reason. We only ask for permission to manage events.
                  </p>
                </div>
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Sync</p>
                  <p className="text-xs text-muted-foreground">Automatic. New leave and WFH are added when they are approved, and anything missing is added whenever you open the calendar.</p>
                </div>
                <div className="grid gap-1.5 border-t pt-3">
                  <p className="text-sm font-medium">Disconnect</p>
                  <p className="text-xs text-muted-foreground">Stops adding new leave and WFH. Events already in your Google Calendar stay there.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit max-md:min-h-11"
                    onClick={() => {
                      setMenu(false);
                      setConfirming(true);
                    }}
                    disabled={busy}
                  >
                    Disconnect Google Calendar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

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
    </section>
  );
}
