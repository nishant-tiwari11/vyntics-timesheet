"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryLabel } from "@/lib/documents/config";
import type { DocRow } from "@/lib/documents/server";
import type { MyOnboarding } from "@/lib/onboarding/server";
import { ACCOUNT_RE, ACCOUNT_TYPES, IFSC_RE, checkBank, missingForSubmit, neededDocs, type Answers } from "@/lib/onboarding/rules";
import { saveOnboardingAction } from "./actions";
import { UploadSlot } from "./UploadSlot";

// ---------------------------- small pieces ----------------------------

function Section({ n, title, done, children, note }: { n: number; title: string; done: boolean; children: React.ReactNode; note?: string }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5" aria-label={title}>
      <div className="flex items-start gap-3">
        {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not done yet" />}
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {n}. {title}
          </h2>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Radio({ name, checked, onChange, label, disabled }: { name: string; checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors ${checked ? "border-foreground bg-accent" : "hover:border-foreground"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="size-4 accent-current" />
      {label}
    </label>
  );
}

// ---------------------------- the whole form ----------------------------

export function OnboardingWizard({ name, email, initial }: { name: string; email: string; initial: MyOnboarding }) {
  const router = useRouter();
  const [a, setA] = useState<Answers>(initial.answers);
  const [again, setAgain] = useState(initial.answers.bank.account);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const locked = initial.submitted;

  // Answers are saved by themselves a moment after you stop typing, so nothing is lost and HR can see how far you got.
  const first = useRef(true);
  useEffect(() => {
    if (locked) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      setSaved("saving");
      // A half-typed account number or IFSC would be refused, so only well-formed ones are sent while drafting.
      const bank = { ...a.bank, account: ACCOUNT_RE.test(a.bank.account) ? a.bank.account : "", ifsc: IFSC_RE.test(a.bank.ifsc) ? a.bank.ifsc : "" };
      const res = await saveOnboardingAction({ answers: { ...a, bank }, accountAgain: again, submit: false });
      setSaved(res.ok ? "saved" : "idle");
    }, 900);
    return () => clearTimeout(timer);
  }, [a, again, locked]);

  const onboardingDocs = initial.docs.filter((d) => d.status !== "rejected");
  const uploaded = new Set(onboardingDocs.map((d) => d.category));
  const letters = { offer: initial.docs.find((d) => d.category === "offer_letter"), joining: initial.docs.find((d) => d.category === "appointment_letter") };
  const needs = neededDocs(a);
  const has = (cat: string) => uploaded.has(cat);
  const missing = missingForSubmit(a, uploaded, again);
  const rejected = initial.docs.filter((d) => d.status === "rejected" && d.visibility === "employee");

  const setBank = (patch: Partial<Answers["bank"]>) => setA((x) => ({ ...x, bank: { ...x.bank, ...patch } }));
  const bankDone = checkBank(a.bank, again) === null;
  const educationDone = !!a.degreeMode && needs.filter((n) => n.category === "degree" || n.category === "marksheets").every((n) => has(n.category));
  const experienceDone = a.hasExperience === false || (a.hasExperience === true && !!a.experienceType && needs.filter((n) => n.category.startsWith("prev_")).every((n) => has(n.category)));
  const done = [educationDone, has("aadhaar"), bankDone, experienceDone, has("passport_photo")];
  const percent = Math.round((done.filter(Boolean).length / done.length) * 100);

  function save(submit: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await saveOnboardingAction({ answers: a, accountAgain: again, submit });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if (submit) {
        toast.success("Submitted. Welcome aboard!");
        router.replace("/timesheet");
        router.refresh();
      } else toast.success("Saved. You can come back and finish later.");
    });
  }

  // ---- After submitting: a short status page, and a way to fix anything HR sent back. ----
  if (locked) {
    return (
      <div className="grid gap-5">
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Your onboarding is submitted</h1>
          <p className="mt-1 text-sm text-muted-foreground">HR will check your documents. If anything needs fixing it will show up here.</p>
        </div>
        {rejected.length > 0 ? (
          <section className="grid gap-3" aria-label="Documents to fix">
            <h2 className="text-base font-semibold">Please upload these again</h2>
            {rejected.map((d) => (
              <UploadSlot key={d.id} category={d.category} label={categoryLabel(d.category)} hint="HR sent this back." docs={[d]} locked={false} replaceable />
            ))}
          </section>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nothing to fix right now.</p>
        )}
        <Button type="button" onClick={() => router.push("/timesheet")} className="w-fit">
          Go to the portal
        </Button>
      </div>
    );
  }

  const letterLink = (d: DocRow | undefined, label: string) => (
    <li key={label} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <span className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
        {label}
      </span>
      {d ? (
        <a href={`/api/documents/${d.id}/download`} className="font-medium underline underline-offset-4">
          Download
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">HR will share this soon</span>
      )}
    </li>
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl border bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name.split(" ")[0]}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Before you start, we need a few things for your employee record. It takes about ten minutes. Signed in as {email}.
          </p>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{done.filter(Boolean).length} of {done.length} steps done</span>
            <span>{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {(letters.offer || letters.joining) && (
        <section className="grid gap-2 rounded-xl border bg-card p-5" aria-label="Letters from HR">
          <h2 className="text-base font-semibold">Your letters from HR</h2>
          <ul className="grid gap-2">
            {letterLink(letters.offer, "Offer letter")}
            {letterLink(letters.joining, "Joining letter")}
          </ul>
        </section>
      )}

      <Section n={1} title="Education" done={educationDone} note="Your highest degree.">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Do you have your degree certificate?">
          <Radio name="degree" checked={a.degreeMode === "degree"} onChange={() => setA({ ...a, degreeMode: "degree" })} label="I have my degree certificate" />
          <Radio name="degree" checked={a.degreeMode === "marksheets"} onChange={() => setA({ ...a, degreeMode: "marksheets" })} label="I don't have it yet. I'll upload all my semester marksheets" />
        </div>
        {needs
          .filter((n) => n.category === "degree" || n.category === "marksheets")
          .map((n) => (
            <UploadSlot key={n.category} category={n.category} label={n.label} hint={n.hint} docs={initial.docs} multiple={n.category === "marksheets"} locked={false} replaceable />
          ))}
      </Section>

      <Section n={2} title="Identity" done={has("aadhaar")} note="Your Aadhaar card as one PDF. Only HR can see it.">
        <UploadSlot category="aadhaar" label="Aadhaar card" hint="One PDF with both sides" docs={initial.docs} locked={false} replaceable />
      </Section>

      <Section n={3} title="Bank account" done={bankDone} note="Your salary is paid into this account. Only HR can see these details.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bank-holder">Account holder name</Label>
            <Input id="bank-holder" value={a.bank.holder} maxLength={100} autoComplete="off" onChange={(e) => setBank({ holder: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-name">Bank name</Label>
            <Input id="bank-name" value={a.bank.bankName} maxLength={100} autoComplete="off" onChange={(e) => setBank({ bankName: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-account">Account number</Label>
            <Input id="bank-account" inputMode="numeric" pattern="[0-9]*" value={a.bank.account} maxLength={20} autoComplete="off" onChange={(e) => setBank({ account: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-account-again">Account number again</Label>
            <Input id="bank-account-again" inputMode="numeric" pattern="[0-9]*" value={again} maxLength={20} autoComplete="off" onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))} aria-invalid={again !== "" && again !== a.bank.account} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-ifsc">IFSC code</Label>
            <Input id="bank-ifsc" value={a.bank.ifsc} maxLength={11} autoComplete="off" className="uppercase" onChange={(e) => setBank({ ifsc: e.target.value.toUpperCase().replace(/\s/g, "") })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-branch">Branch</Label>
            <Input id="bank-branch" value={a.bank.branch} maxLength={100} autoComplete="off" onChange={(e) => setBank({ branch: e.target.value })} />
          </div>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Type of account</legend>
          <div className="flex flex-wrap gap-3">
            {ACCOUNT_TYPES.map((t) => (
              <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm">
                <Checkbox checked={a.bank.type === t.id} onCheckedChange={(c) => setBank({ type: c ? t.id : "" })} aria-label={t.label} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
          <Checkbox checked={a.bank.confirmed} onCheckedChange={(c) => setBank({ confirmed: c === true })} className="mt-0.5" aria-label="Confirm the bank details" />
          I confirm these bank details are correct and the account is in my own name.
        </label>
      </Section>

      <Section n={4} title="Past experience" done={experienceDone} note="Have you worked anywhere before, including internships?">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Do you have past experience?">
          <Radio name="exp" checked={a.hasExperience === true} onChange={() => setA({ ...a, hasExperience: true })} label="Yes, I have" />
          <Radio name="exp" checked={a.hasExperience === false} onChange={() => setA({ ...a, hasExperience: false, experienceType: null })} label="No, this is my first role" />
        </div>
        {a.hasExperience === true && (
          <>
            <UploadSlot category="prev_offer_letter" label="Offer letter of your previous company" hint="One PDF" docs={initial.docs} locked={false} replaceable />
            <div className="grid gap-2">
              <p className="text-sm font-medium">Was it a free internship or paid?</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Free internship or paid">
                <Radio name="exp-type" checked={a.experienceType === "free_internship"} onChange={() => setA({ ...a, experienceType: "free_internship" })} label="Free internship" />
                <Radio name="exp-type" checked={a.experienceType === "paid"} onChange={() => setA({ ...a, experienceType: "paid" })} label="Paid" />
              </div>
            </div>
            {a.experienceType === "paid" && <UploadSlot category="prev_payslip" label="Your latest payslip" hint="One PDF, from the previous company" docs={initial.docs} locked={false} replaceable />}
          </>
        )}
      </Section>

      <Section n={5} title="Photo" done={has("passport_photo")} note="A recent passport-size photo with a plain background.">
        <UploadSlot category="passport_photo" label="Passport-size photo" hint="JPG or PNG" docs={initial.docs} locked={false} replaceable />
      </Section>

      <div className="grid gap-3 rounded-xl border bg-card p-5">
        {missing.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Still to do</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {missing.slice(0, 6).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => save(true)} disabled={pending || missing.length > 0}>
            {pending ? "Saving..." : "Submit onboarding"}
          </Button>
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={pending}>
            Save and finish later
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {saved === "saving" ? "Saving your answers..." : saved === "saved" ? "Your answers are saved." : "Your answers are saved as you go."}
        </p>
        <p className="text-xs text-muted-foreground">After you submit, HR checks your documents. You can&apos;t edit your answers after that, but you can replace anything HR sends back.</p>
      </div>
    </div>
  );
}
