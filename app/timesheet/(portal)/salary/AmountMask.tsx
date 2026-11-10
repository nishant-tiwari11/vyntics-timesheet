"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/payroll/money";

// "Hide amounts": numbers show as •••• until you choose to reveal them. Hidden is the default every time, and your
// choice is remembered for this browser session only (sessionStorage), never sent anywhere.

const KEY = "ts-salary-visible";
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readHidden(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) !== "1"; // anything but an explicit "show" means hidden
  } catch {
    return true;
  }
}

function setHidden(hidden: boolean) {
  try {
    if (hidden) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, "1");
  } catch {}
  listeners.forEach((l) => l());
}

/** True while amounts are masked. On the server, and before the browser has checked, it is always true. */
export function useHidden(): boolean {
  return useSyncExternalStore(subscribe, readHidden, () => true);
}

/** An amount in paise, masked or formatted. The money is already exact; this only decides how it is shown. */
export function Amount({ paise, currency, className }: { paise: number; currency: string; className?: string }) {
  const hidden = useHidden();
  if (hidden) {
    return (
      <span className={className} aria-label="Amount hidden">
        ••••
      </span>
    );
  }
  return <span className={className}>{formatMoney(paise, currency)}</span>;
}

export function HideToggle() {
  const hidden = useHidden();
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => setHidden(!hidden)} aria-pressed={!hidden} aria-label={hidden ? "Show amounts" : "Hide amounts"}>
      {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      {hidden ? "Show amounts" : "Hide amounts"}
    </Button>
  );
}
