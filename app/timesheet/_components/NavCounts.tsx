"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// The numbers on the menu items (what is waiting for you). They load after the page is on screen, so they never slow it, and
// refresh every minute and a half while the tab is open and when you come back to it.
const NavCountsContext = createContext<Record<string, number>>({});

export const useNavCounts = () => useContext(NavCountsContext);

export function NavCountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const last = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/nav-counts", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { counts?: Record<string, number> };
      last.current = Date.now();
      setCounts(body.counts ?? {});
    } catch {
      /* offline or a hiccup: the next check tries again */
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), 90_000);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - last.current > 30_000 && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return <NavCountsContext.Provider value={counts}>{children}</NavCountsContext.Provider>;
}
