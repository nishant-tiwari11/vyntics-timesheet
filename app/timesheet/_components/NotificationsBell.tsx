"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Bell, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeTime, toneOf, type Tone } from "@/lib/notifications";
import type { NotificationItem } from "@/lib/shell/server";
import { useShellData } from "./NavCounts";
import { markNotificationsReadAction } from "./notificationsActions";

const NONE: NotificationItem[] = [];
const APPROVALS_HREF = "/timesheet/admin/approvals";

const TONE: Record<Tone, { icon: typeof Info; label: string; className: string }> = {
  good: { icon: CheckCircle2, label: "Good news", className: "text-foreground" },
  bad: { icon: XCircle, label: "Needs attention", className: "text-destructive" },
  warn: { icon: AlertCircle, label: "Reminder", className: "text-orange-600" },
  info: { icon: Info, label: "Information", className: "text-muted-foreground" },
};

// The one bell for everybody. Its list has your notifications (a request or time log was approved or rejected, a document
// was verified, a payslip is ready, a required document is missing...) and, for admins, a first line with how many requests,
// time logs and comp-offs wait for a decision. The number on the bell adds the two together.
// It loads after the page is on screen, so it never slows the page, and it checks again every minute and a half while the
// tab is open. A notification is marked read when you open it; "Mark all as read" does them all.
export function NotificationsBell() {
  // The list comes with the rest of the frame's data (one request for the menu counts, the bell and the pictures).
  const { data, update } = useShellData();
  const items = data?.notifications.items ?? NONE;
  const unread = data?.notifications.unread ?? 0;
  const approvals = data?.notifications.approvals ?? null;
  const [open, setOpen] = useState(false);

  function markRead(ids: string[]) {
    const fresh = items.filter((n) => ids.includes(n.id) && !n.read).length;
    if (fresh === 0) return;
    update((d) => ({ ...d, notifications: { ...d.notifications, items: d.notifications.items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)), unread: Math.max(0, d.notifications.unread - fresh) } }));
    void markNotificationsReadAction(ids);
  }

  function markAllRead() {
    update((d) => ({ ...d, notifications: { ...d.notifications, items: d.notifications.items.map((n) => ({ ...n, read: true })), unread: 0 } }));
    void markNotificationsReadAction();
  }

  const waiting = approvals?.total ?? 0;
  const count = unread + waiting;
  const label = count === 0 ? "Notifications" : `Notifications, ${count} need${count === 1 ? "s" : ""} your attention`;
  const nothing = items.length === 0 && waiting === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="ts-btn ts-btn-ghost ts-icon-btn ts-bell" aria-label={label}>
          <Bell className="size-[18px]" aria-hidden="true" />
          {count > 0 && <span className="ts-bell-count">{count > 99 ? "99+" : count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground max-md:min-h-9 max-md:px-1">
              Mark all as read
            </button>
          )}
        </div>

        {approvals && waiting > 0 && (
          <Link href={APPROVALS_HREF} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2.5 hover:bg-muted">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{waiting} waiting for a decision</span>
              <span className="block text-xs text-muted-foreground">
                {[
                  approvals.requests > 0 && `${approvals.requests} ${approvals.requests === 1 ? "request" : "requests"}`,
                  approvals.logs > 0 && `${approvals.logs} work ${approvals.logs === 1 ? "log" : "logs"}`,
                  approvals.compOff > 0 && `${approvals.compOff} comp-off`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}

        {nothing ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : items.length > 0 ? (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => {
              const tone = TONE[toneOf(n.title)];
              const Icon = tone.icon;
              const body = (
                <span className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone.className}`} aria-label={tone.label} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? "font-normal" : "font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="block text-sm break-words text-muted-foreground">{n.body}</span>}
                    <span className="block text-xs text-muted-foreground">{relativeTime(n.at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-600" aria-label="Unread" />}
                </span>
              );
              return (
                <li key={n.id} className={n.read ? "" : "bg-muted/30"}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => {
                        markRead([n.id]);
                        setOpen(false);
                      }}
                      className="block px-3 py-2.5 hover:bg-muted"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => markRead([n.id])} className="block w-full px-3 py-2.5 text-left hover:bg-muted">
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
