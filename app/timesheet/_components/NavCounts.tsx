"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { changed, readCache, writeCache } from "@/lib/client/localCache";
import type { ShellData } from "@/lib/shell/server";

// What the portal's frame shows: the numbers on the menu, the notification bell and who has a profile picture. All three come
// from ONE request to /api/shell (one sign-in check, one round of database calls), after the page is on screen so it never slows
// it. The answer from last time is saved in the browser and drawn first; the server is asked right after, and the screen is
// redrawn only if the answer is different. It refreshes every minute and a half while the tab is open and when you come back to it.

type ShellState = { data: ShellData | null; update: (change: (old: ShellData) => ShellData) => void };

const EMPTY_COUNTS: Record<string, number> = {};
const Context = createContext<ShellState>({ data: null, update: () => {} });

export const useShellData = () => useContext(Context);
export const useNavCounts = () => useContext(Context).data?.counts ?? EMPTY_COUNTS;

/** A signal that something changed (a new profile picture, say): the frame asks the server again at once. */
export const refreshShell = () => window.dispatchEvent(new Event("ts-shell-refresh"));

export function NavCountsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [data, setData] = useState<ShellData | null>(null);
  const last = useRef(0);

  const load = useCallback(
    async (reminders: boolean) => {
      try {
        const res = await fetch(`/api/shell${reminders ? "?refresh=1" : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean } & Partial<ShellData>;
        if (!body.ok || !body.counts || !body.notifications || !body.avatars) return;
        const next: ShellData = { counts: body.counts, notifications: body.notifications, avatars: body.avatars };
        last.current = Date.now();
        // Only redraw (and save) when something really changed.
        setData((old) => (changed(old, next) ? next : old));
        writeCache(userId, "shell", next);
      } catch {
        /* offline or a hiccup: the next check tries again */
      }
    },
    [userId],
  );

  useEffect(() => {
    // Reminders (missing or expiring documents) only need making now and then, so ask for that about once an hour. Every other
    // check just reads, which saves the server several database calls.
    let reminders = true;
    try {
      const at = Number(window.localStorage.getItem("ts-reminders-at") ?? 0);
      reminders = !(Date.now() - at < 60 * 60 * 1000);
      if (reminders) window.localStorage.setItem("ts-reminders-at", String(Date.now()));
    } catch {
      /* storage blocked: always ask */
    }
    const first = window.setTimeout(() => {
      const saved = readCache<ShellData>(userId, "shell");
      if (saved) setData(saved.value);
      void load(reminders);
    }, 0);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(false), 90_000);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - last.current > 30_000 && void load(false);
    const onRefresh = () => void load(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("ts-shell-refresh", onRefresh);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("ts-shell-refresh", onRefresh);
    };
  }, [load, userId]);

  // A change made on screen (a notification marked read) is shown at once and saved, without waiting for the server.
  const update = useCallback(
    (change: (old: ShellData) => ShellData) =>
      setData((old) => {
        if (!old) return old;
        const next = change(old);
        writeCache(userId, "shell", next);
        return next;
      }),
    [userId],
  );

  const value = useMemo(() => ({ data, update }), [data, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
