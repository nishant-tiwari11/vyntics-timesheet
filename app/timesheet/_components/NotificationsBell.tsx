"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatInstantDate } from "@/lib/timesheet/dates";
import type { NotificationItem } from "@/app/api/notifications/route";
import { markNotificationsReadAction } from "./notificationsActions";

// Your notifications: a document was verified or rejected, a required document is missing, one is about to expire.
// They load after the page is on screen, so they never slow it down. Opening the list marks them as read.
export function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { items: NotificationItem[]; unread: number } | null) => {
        if (live && body) {
          setItems(body.items);
          setUnread(body.unread);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) {
      // Leave the dots showing while the list is open, and clear them when it closes.
      void markNotificationsReadAction();
    }
    if (!next) {
      setUnread(0);
      setItems((all) => all.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="ts-btn ts-btn-ghost ts-icon-btn ts-bell" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
          <Inbox className="size-[18px]" aria-hidden="true" />
          {unread > 0 && <span className="ts-bell-count">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <p className="border-b px-3 py-2 text-sm font-semibold">Notifications</p>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => {
              const body = (
                <>
                  <span className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-600" aria-label="Unread" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="block text-sm break-words text-muted-foreground">{n.body}</span>}
                      <span className="block text-xs text-muted-foreground">{formatInstantDate(n.at)}</span>
                    </span>
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => setOpen(false)} className="block px-3 py-2.5 hover:bg-muted">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
