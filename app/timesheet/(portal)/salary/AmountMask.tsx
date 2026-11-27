"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/payroll/money";
import { createSalaryPinAction, lockSalaryAction, resetSalaryPinAction, unlockSalaryAction } from "./actions";

// "Show amounts" asks for the employee's salary PIN. The server only sends the money while the page is unlocked, so hiding is
// not just cosmetic: with the page locked, the numbers are not in the page at all.

export type PinState = "none" | "locked" | "open";

const LockContext = createContext(true);
/** Opens the PIN popup. `then` says what to do once the PIN is right: open a page, or start a download. */
type Then = { href: string; download?: boolean } | null;
const AskContext = createContext<(then?: Then) => void>(() => {});

/** Wraps the page: everything inside reads whether the amounts are hidden, and can open the PIN popup. */
export function SalaryLock({ locked, state, pinLength, children }: { locked: boolean; state: PinState; pinLength: number | null; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("enter");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [password, setPassword] = useState("");
  // The number of boxes: the person's own PIN length when they enter it; when they choose a PIN they pick 4 or 6.
  const [chosen, setChosen] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [then, setThen] = useState<Then>(null);

  function ask(next: Then = null) {
    setPin("");
    setAgain("");
    setPassword("");
    setError(null);
    setChosen(4);
    setThen(next);
    setMode(state === "none" ? "create" : "enter");
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "enter" ? pin.length < 4 : pin.length !== boxes) return setError(mode === "enter" ? "The PIN must be 4 to 6 digits." : `The PIN must be ${boxes} digits.`);
    if (mode !== "enter" && pin !== again) return setError("The two PINs don't match.");
    if (mode === "forgot" && !password) return setError("Enter your login password.");
    startTransition(async () => {
      const r = mode === "create" ? await createSalaryPinAction(pin) : mode === "forgot" ? await resetSalaryPinAction(password, pin) : await unlockSalaryAction(pin);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      if (mode !== "enter") toast.success("Your salary PIN is saved.");
      if (then?.download) {
        router.refresh();
        window.location.assign(then.href);
      } else if (then) router.push(then.href);
      else router.refresh();
    });
  }

  const boxes = mode === "enter" ? (pinLength ?? 6) : chosen;
  const title = mode === "create" ? "Create your salary PIN" : mode === "forgot" ? "Choose a new salary PIN" : "Enter your salary PIN";
  const about =
    mode === "create"
      ? "Choose 4 to 6 digits. You will type it to see your amounts. Don't use your phone number or birth year."
      : mode === "forgot"
        ? "Enter your login password to prove it is you, then choose a new PIN."
        : "Amounts stay visible for 10 minutes, or until you press Hide amounts.";

  return (
    <LockContext.Provider value={locked}>
      <AskContext.Provider value={ask}>
        {children}
        <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="grid gap-5">
            <DialogHeader className="items-center text-center sm:text-center">
              <span className="mb-1 grid size-12 place-items-center rounded-full bg-foreground text-background">
                <Lock className="size-5" aria-hidden="true" />
              </span>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{about}</DialogDescription>
            </DialogHeader>

            {mode === "forgot" && (
              <div className="grid gap-1.5">
                <Label htmlFor="sal-pw">Login password</Label>
                <Input id="sal-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {mode !== "enter" && (
              <div role="group" aria-label="PIN length" className="mx-auto inline-flex rounded-full border p-0.5 text-sm">
                {[4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={chosen === n}
                    onClick={() => { setChosen(n); setPin((v) => v.slice(0, n)); setAgain((v) => v.slice(0, n)); }}
                    className={`rounded-full px-4 py-1 transition-colors ${chosen === n ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {n} digits
                  </button>
                ))}
              </div>
            )}
            <PinField id="sal-pin" label={mode === "enter" ? "Salary PIN" : "New PIN"} value={pin} onChange={setPin} autoFocus={mode !== "forgot"} length={boxes} />
            {mode !== "enter" && <PinField id="sal-pin2" label="Type it again" value={again} onChange={setAgain} length={boxes} />}

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="grid gap-3">
              <Button type="submit" size="lg" className="w-full" disabled={pending || (mode === "enter" ? pin.length < (pinLength ?? 4) : pin.length !== boxes)}>
                {pending ? "Checking..." : mode === "enter" ? "Show amounts" : "Save PIN"}
              </Button>
              {mode === "enter" && (
                <button type="button" onClick={() => { setMode("forgot"); setError(null); setPin(""); setAgain(""); }} className="justify-self-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Forgot PIN?
                </button>
              )}
            </div>
          </form>
        </DialogContent>
        </Dialog>
      </AskContext.Provider>
    </LockContext.Provider>
  );
}

/** A View or PDF link that, while amounts are hidden, asks for the PIN in the popup first and then carries on. */
export function GatedLink({ href, download, className, children, ...rest }: { href: string; download?: boolean; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const hidden = useHidden();
  const ask = useContext(AskContext);
  if (!hidden) {
    return download ? (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    ) : (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => ask({ href, download })} aria-label={rest["aria-label"]}>
      {children}
    </button>
  );
}

/** True while amounts are hidden. */
export function useHidden(): boolean {
  return useContext(LockContext);
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

type Mode = "create" | "enter" | "forgot";

const pinOnly = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** The PIN as six boxes that fill with dots. A real (invisible) input sits on top, so typing, pasting and password managers all work. */
function PinField({ id, label, value, onChange, autoFocus, length }: { id: string; label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; length: number }) {
  return (
    <div className="grid justify-items-center gap-2">
      <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <div className="flex gap-2" aria-hidden="true">
          {Array.from({ length }, (_, i) => {
            const filled = i < value.length;
            const active = i === value.length;
            return (
              <span
                key={i}
                className={`grid size-11 place-items-center rounded-xl border bg-muted/40 transition-colors ${active ? "border-foreground ring-2 ring-foreground/15" : ""} ${filled ? "border-foreground/40 bg-background" : ""}`}
              >
                {filled && <span className="size-2.5 rounded-full bg-foreground" />}
              </span>
            );
          })}
        </div>
        <input
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={length}
          value={value}
          onChange={(e) => onChange(pinOnly(e.target.value).slice(0, length))}
          className="absolute inset-0 size-full cursor-text opacity-0"
        />
      </div>
    </div>
  );
}

export function HideToggle({ state }: { state: PinState }) {
  const router = useRouter();
  const ask = useContext(AskContext);
  const [pending, startTransition] = useTransition();
  const shown = state === "open";

  function hide() {
    startTransition(async () => {
      const r = await lockSalaryAction();
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={shown ? hide : () => ask()} disabled={pending && shown} aria-pressed={shown}>
      {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      {shown ? "Hide amounts" : "Show amounts"}
    </Button>
  );
}
