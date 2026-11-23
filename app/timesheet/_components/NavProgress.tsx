"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin bar across the top that starts the moment a link is clicked and finishes when the new page has arrived, so a click is
// never met with silence while the next page loads. It only watches clicks on links inside the portal.
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // A click on a link to a different address starts it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/timesheet")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      clear();
      setState("loading");
      timers.current.push(window.setTimeout(() => setState("idle"), 15_000)); // never leave it hanging
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new page arriving finishes it.
  useEffect(() => {
    clear();
    timers.current.push(window.setTimeout(() => setState((s) => (s === "loading" ? "done" : s)), 0));
    timers.current.push(window.setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 350));
    return clear;
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[400] h-0.5">
      <div
        className="h-full bg-primary"
        style={{
          width: state === "done" ? "100%" : "85%",
          opacity: state === "done" ? 0 : 1,
          transition: state === "done" ? "width 150ms ease-out, opacity 300ms ease 150ms" : "width 8s cubic-bezier(0.1, 0.8, 0.2, 1)",
        }}
      />
    </div>
  );
}
