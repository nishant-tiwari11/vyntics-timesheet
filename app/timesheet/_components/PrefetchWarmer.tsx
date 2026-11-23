"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { portalLinks } from "./NavLinks";

// Once the page you opened is on screen and the browser is idle, the other pages in the menu are loaded quietly in the
// background, one at a time, so they are already here when you click them. It starts a few seconds after the page appears, goes
// gently (a pause between pages), skips anything when the tab is hidden or the connection is set to save data, and tops the pages
// up every couple of minutes while you keep the tab open (the browser keeps a prefetched page for about three minutes).
//
// Pages that record that someone looked at them (payroll and your own salary) are left out, so the activity log stays truthful.
const FIRST_DELAY_MS = 2500;
const GAP_MS = 700;
const TOP_UP_MS = 150_000;

const skipped = (href: string) => href.startsWith("/timesheet/salary") || (href.startsWith("/timesheet/payroll") && !href.startsWith("/timesheet/payroll/expenses"));

export function PrefetchWarmer({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const running = useRef(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const links = portalLinks(role)
      .map((l) => l.href)
      .filter((href) => !skipped(href) && href.split("?")[0] !== pathname);

    let cancelled = false;
    const timers: number[] = [];

    const warm = () => {
      if (running.current || cancelled || document.visibilityState !== "visible") return;
      running.current = true;
      links.forEach((href, i) => {
        timers.push(
          window.setTimeout(() => {
            if (!cancelled && document.visibilityState === "visible") router.prefetch(href);
            if (i === links.length - 1) running.current = false;
          }, i * GAP_MS),
        );
      });
    };

    const idle = (fn: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 0));
    timers.push(window.setTimeout(() => idle(warm), FIRST_DELAY_MS));
    const topUp = window.setInterval(warm, TOP_UP_MS);

    return () => {
      cancelled = true;
      running.current = false;
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(topUp);
    };
  }, [role, pathname, router]);

  return null;
}
