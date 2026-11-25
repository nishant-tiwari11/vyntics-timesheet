"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/payroll/money";
import { createSalaryPinAction, lockSalaryAction, resetSalaryPinAction, unlockSalaryAction } from "./actions";

// "Show amounts" asks for the employee's salary PIN. The server only sends the money while the page is unlocked, so hiding is
// not just cosmetic: with the page locked, the numbers are not in the page at all.

export type PinState = "none" | "locked" | "open";

const LockContext = createContext(true);

/** Wraps the page: everything inside reads whether the amounts are hidden. */
export function SalaryLock({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  return <LockContext.Provider value={locked}>{children}</LockContext.Provider>;
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

export function HideToggle({ state }: { state: PinState }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("enter");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = state === "open";

  function begin() {
    setPin("");
    setAgain("");
    setPassword("");
    setError(null);
    setMode(state === "none" ? "create" : "enter");
    setOpen(true);
  }

  function hide() {
    startTransition(async () => {
      const r = await lockSalaryAction();
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError("The PIN must be 4 to 6 digits.");
    if (mode !== "enter" && pin !== again) return setError("The two PINs don't match.");
    if (mode === "forgot" && !password) return setError("Enter your login password.");
    startTransition(async () => {
      const r = mode === "create" ? await createSalaryPinAction(pin) : mode === "forgot" ? await resetSalaryPinAction(password, pin) : await unlockSalaryAction(pin);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      if (mode !== "enter") toast.success("Your salary PIN is saved.");
      router.refresh();
    });
  }

  const title = mode === "create" ? "Create your salary PIN" : mode === "forgot" ? "Choose a new salary PIN" : "Enter your salary PIN";
  const about =
    mode === "create"
      ? "Choose 4 to 6 digits. You will type it to see your amounts. Don't use your phone number or birth year."
      : mode === "forgot"
        ? "Enter your login password to prove it is you, then choose a new PIN."
        : "Amounts stay visible for 10 minutes, or until you press Hide amounts.";

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={shown ? hide : begin} disabled={pending && shown} aria-pressed={shown}>
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {shown ? "Hide amounts" : "Show amounts"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-4" aria-hidden="true" /> {title}
              </DialogTitle>
              <DialogDescription>{about}</DialogDescription>
            </DialogHeader>

            {mode === "forgot" && (
              <div className="grid gap-1.5">
                <Label htmlFor="sal-pw">Login password</Label>
                <Input id="sal-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="sal-pin">{mode === "enter" ? "Salary PIN" : "New PIN"}</Label>
              <Input id="sal-pin" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(pinOnly(e.target.value))} className="tracking-[0.4em]" />
            </div>
            {mode !== "enter" && (
              <div className="grid gap-1.5">
                <Label htmlFor="sal-pin2">Type it again</Label>
                <Input id="sal-pin2" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={again} onChange={(e) => setAgain(pinOnly(e.target.value))} className="tracking-[0.4em]" />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="items-center sm:justify-between">
              {mode === "enter" ? (
                <button type="button" onClick={() => { setMode("forgot"); setError(null); setPin(""); setAgain(""); }} className="text-sm underline underline-offset-4">
                  Forgot PIN?
                </button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Checking..." : mode === "enter" ? "Show amounts" : "Save PIN"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
