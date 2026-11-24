"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Download, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LetterPreview } from "@/components/offers/LetterPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildLetter } from "@/lib/offers/build";
import { checkLetter } from "@/lib/offers/check";
import { addMonths, dayAfter, dayBefore, defaultPhases, monthName } from "@/lib/offers/defaults";
import type { ClauseKey } from "@/lib/offers/clauses";
import { ENGAGEMENT_TYPES, WORK_LOCATIONS, isInternship, type CompanyInfo, type EngagementType, type LetterData, type Phase } from "@/lib/offers/types";
import { deleteOfferAction, saveOfferAction, sendOfferAction } from "./actions";

const field = "grid gap-1.5";
const select = "h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20 max-md:h-11";

export type EditorLetter = { id: string | null; userId: string; status: "draft" | "sent" | "accepted"; version: number; isCurrent: boolean };

export function OfferEditor({
  letter,
  initial,
  company,
  clauses,
  logoUrl,
}: {
  letter: EditorLetter;
  initial: LetterData;
  company: CompanyInfo;
  clauses: Record<ClauseKey, string>;
  logoUrl?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<LetterData>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"send" | "delete" | null>(null);
  const locked = letter.status !== "draft" || !letter.isCurrent;
  const dirty = JSON.stringify(data) !== saved;

  const set = <K extends keyof LetterData>(key: K, value: LetterData[K]) => setData((d) => ({ ...d, [key]: value }));
  const text = (key: keyof LetterData) => (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never);

  function chooseType(type: EngagementType) {
    setData((d) => ({ ...d, engagementType: type, phases: defaultPhases(type, d.joiningDate), designation: type === "full_time" && d.designation === "Intern" ? "" : d.designation, ppoConsideration: type === "full_time" ? false : d.ppoConsideration, noticeDays: type === "full_time" && d.noticeDays === "7" ? "30" : d.noticeDays }));
  }
  const setPhase = (i: number, patch: Partial<Phase>) => set("phases", data.phases.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  // The live preview: the same builder the PDF uses.
  const view = useMemo(() => {
    const r = checkLetter(data);
    return r.ok ? { ok: true as const, doc: buildLetter(r.data, company, clauses) } : { ok: false as const, error: r.error };
  }, [data, company, clauses]);

  function save(then?: (id: string) => void) {
    startTransition(async () => {
      const res = await saveOfferAction(letter.id, letter.userId, data);
      if (!res.ok) return void toast.error(res.error);
      const id = res.id ?? letter.id ?? "";
      if (locked) toast.success("A new draft version was created. The sent letter is unchanged.");
      else toast.success("Draft saved.");
      setSaved(JSON.stringify(data));
      if (then) return then(id);
      if (id !== letter.id) router.replace(`/timesheet/admin/offers/${id}`);
      else router.refresh();
    });
  }

  function send() {
    setConfirm(null);
    save((id) => {
      startTransition(async () => {
        const res = await sendOfferAction(id);
        if (!res.ok) {
          toast.error(res.error);
          if (id !== letter.id) router.replace(`/timesheet/admin/offers/${id}`);
          return;
        }
        toast.success("Sent. The letter is on the employee's profile under Documents.");
        router.replace(`/timesheet/admin/offers/${id}`);
        router.refresh();
      });
    });
  }

  function remove() {
    setConfirm(null);
    if (!letter.id) return;
    startTransition(async () => {
      const res = await deleteOfferAction(letter.id!);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Draft deleted.");
      router.replace("/timesheet/admin/offers");
    });
  }

  const intern = isInternship(data.engagementType);
  const busy = pending;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        {locked && (
          <p role="note" className="rounded-lg border border-dashed p-3 text-sm">
            {letter.isCurrent ? (
              <>
                This letter is <strong>{letter.status}</strong> and locked. To change it, create a new version: the sent letter stays as it is.
              </>
            ) : (
              <>This is an older version, kept for the record. Open the latest version to change anything.</>
            )}
          </p>
        )}

        <fieldset disabled={busy || (locked && letter.isCurrent === false)} className="grid gap-5">
          {/* ---------------- type ---------------- */}
          <div className="grid gap-2" role="radiogroup" aria-label="Type of letter">
            <Label>Type of letter</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ENGAGEMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={data.engagementType === t.id}
                  disabled={locked}
                  onClick={() => chooseType(t.id)}
                  className="rounded-[var(--radius)] border p-3 text-left text-sm transition-colors hover:border-foreground aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background max-md:min-h-11"
                >
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-xs opacity-75">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ---------------- the person ---------------- */}
          <section className="grid gap-3 rounded-lg border p-4" aria-label="The employee">
            <h2 className="text-sm font-semibold">The employee</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={field}>
                <Label htmlFor="o-name">Name</Label>
                <Input id="o-name" value={data.candidateName} onChange={text("candidateName")} maxLength={100} />
              </div>
              <div className={field}>
                <Label htmlFor="o-role">Role / designation</Label>
                <Input id="o-role" value={data.designation} onChange={text("designation")} maxLength={100} />
              </div>
              <div className={`${field} sm:col-span-2`}>
                <Label htmlFor="o-address">Address</Label>
                <Input id="o-address" value={data.candidateAddress} onChange={text("candidateAddress")} maxLength={250} />
              </div>
              <div className={field}>
                <Label htmlFor="o-email">Email</Label>
                <Input id="o-email" type="email" value={data.candidateEmail} onChange={text("candidateEmail")} maxLength={120} />
              </div>
              <div className={field}>
                <Label htmlFor="o-phone">Phone</Label>
                <Input id="o-phone" inputMode="tel" value={data.candidatePhone} onChange={text("candidatePhone")} maxLength={20} />
              </div>
              <div className={field}>
                <Label htmlFor="o-manager">Reporting manager</Label>
                <Input id="o-manager" value={data.reportingManager} onChange={text("reportingManager")} maxLength={100} />
              </div>
              <div className={field}>
                <Label htmlFor="o-loc">Work location</Label>
                <select id="o-loc" className={select} value={data.workLocation} onChange={(e) => set("workLocation", e.target.value as LetterData["workLocation"])}>
                  {WORK_LOCATIONS.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ---------------- the letter ---------------- */}
          <section className="grid gap-3 rounded-lg border p-4" aria-label="The letter">
            <h2 className="text-sm font-semibold">The letter</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={field}>
                <Label htmlFor="o-ldate">Letter date</Label>
                <Input id="o-ldate" type="date" value={data.letterDate} onChange={text("letterDate")} />
              </div>
              <div className={field}>
                <Label htmlFor="o-jdate">Joining date</Label>
                <Input
                  id="o-jdate"
                  type="date"
                  value={data.joiningDate}
                  onChange={(e) => {
                    const joiningDate = e.target.value;
                    // The first phase follows the joining date until its dates are changed by hand.
                    setData((d) => ({ ...d, joiningDate, phases: d.phases.length > 0 && d.phases[0].startDate === d.joiningDate ? d.phases.map((p, k) => (k === 0 ? { ...p, startDate: joiningDate } : p)) : d.phases }));
                  }}
                />
              </div>
              <div className={field}>
                <Label htmlFor="o-notice">Notice period (days)</Label>
                <Input id="o-notice" inputMode="numeric" value={data.noticeDays} onChange={text("noticeDays")} maxLength={3} />
              </div>
              <div className={field}>
                <Label htmlFor="o-noncirc">Non-circumvention (months)</Label>
                <Input id="o-noncirc" inputMode="numeric" value={data.nonCircumventionMonths} onChange={text("nonCircumventionMonths")} maxLength={2} />
                <p className="text-xs text-muted-foreground">0 leaves the clause out.</p>
              </div>
            </div>
          </section>

          {/* ---------------- phases ---------------- */}
          {intern && (
            <section className="grid gap-3 rounded-lg border p-4" aria-label={data.engagementType === "phased_internship" ? "Phases" : "Internship period"}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{data.engagementType === "phased_internship" ? "Phases" : "Internship period"}</h2>
                {data.engagementType === "phased_internship" && data.phases.length < 8 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-md:min-h-11"
                    disabled={locked}
                    onClick={() => {
                      const last = data.phases[data.phases.length - 1];
                      const start = last ? dayAfter(last.endDate) : data.joiningDate;
                      set("phases", [...data.phases, { name: `Phase ${data.phases.length + 1}`, startDate: start, endDate: dayBefore(addMonths(start, 3)), isPaid: true, monthlyAmount: "", evaluationWindow: monthName(dayBefore(addMonths(start, 3))) }]);
                    }}
                  >
                    <Plus aria-hidden="true" /> Add phase
                  </Button>
                )}
              </div>
              {data.phases.map((p, i) => (
                <div key={i} className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                  {data.engagementType === "phased_internship" && (
                    <div className={field}>
                      <Label htmlFor={`p-name-${i}`}>Name</Label>
                      <Input id={`p-name-${i}`} value={p.name} onChange={(e) => setPhase(i, { name: e.target.value })} maxLength={40} />
                    </div>
                  )}
                  <div className={field}>
                    <Label htmlFor={`p-start-${i}`}>Start date</Label>
                    <Input id={`p-start-${i}`} type="date" value={p.startDate} onChange={(e) => setPhase(i, { startDate: e.target.value })} />
                  </div>
                  <div className={field}>
                    <Label htmlFor={`p-end-${i}`}>End date</Label>
                    <Input id={`p-end-${i}`} type="date" value={p.endDate} onChange={(e) => setPhase(i, { endDate: e.target.value })} />
                  </div>
                  {data.engagementType === "phased_internship" && (
                    <div className="flex items-center gap-2 self-end pb-1">
                      <Switch id={`p-paid-${i}`} checked={p.isPaid} onCheckedChange={(v) => setPhase(i, { isPaid: v })} />
                      <Label htmlFor={`p-paid-${i}`} className="font-normal">
                        Paid phase
                      </Label>
                    </div>
                  )}
                  {p.isPaid && (
                    <div className={field}>
                      <Label htmlFor={`p-amt-${i}`}>Monthly stipend (INR)</Label>
                      <Input id={`p-amt-${i}`} inputMode="numeric" value={p.monthlyAmount} onChange={(e) => setPhase(i, { monthlyAmount: e.target.value })} placeholder="12000" />
                    </div>
                  )}
                  {data.engagementType === "phased_internship" && (
                    <div className={field}>
                      <Label htmlFor={`p-eval-${i}`}>Evaluation window</Label>
                      <Input id={`p-eval-${i}`} value={p.evaluationWindow} onChange={(e) => setPhase(i, { evaluationWindow: e.target.value })} placeholder="January 2027" maxLength={40} />
                    </div>
                  )}
                  {data.engagementType === "phased_internship" && data.phases.length > 2 && (
                    <Button type="button" variant="ghost" size="sm" className="w-fit max-md:min-h-11" disabled={locked} onClick={() => set("phases", data.phases.filter((_, k) => k !== i))}>
                      <Trash2 aria-hidden="true" /> Remove phase
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Switch id="o-ppo" checked={data.ppoConsideration} onCheckedChange={(v) => set("ppoConsideration", v)} />
                <Label htmlFor="o-ppo" className="font-normal">
                  PPO consideration (adds the PPO wording and the full-time compensation row)
                </Label>
              </div>
            </section>
          )}

          {/* ---------------- full-time pay ---------------- */}
          {!intern && (
            <section className="grid gap-3 rounded-lg border p-4" aria-label="Salary">
              <h2 className="text-sm font-semibold">Salary</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={field}>
                  <Label htmlFor="o-ctc">Annual CTC (INR)</Label>
                  <Input id="o-ctc" inputMode="numeric" value={data.ctc} onChange={text("ctc")} placeholder="600000" />
                </div>
                <div className={field}>
                  <Label htmlFor="o-prob">Probation (months)</Label>
                  <Input id="o-prob" inputMode="numeric" value={data.probationMonths} onChange={text("probationMonths")} maxLength={2} />
                </div>
              </div>
              <p className="text-sm font-medium">Salary breakup (monthly, optional)</p>
              {data.salaryBreakup.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                  <Input aria-label={`Component ${i + 1}`} value={l.label} placeholder="Basic" onChange={(e) => set("salaryBreakup", data.salaryBreakup.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} maxLength={60} />
                  <Input aria-label={`Monthly amount ${i + 1}`} inputMode="numeric" value={l.monthly} placeholder="30000" onChange={(e) => set("salaryBreakup", data.salaryBreakup.map((x, k) => (k === i ? { ...x, monthly: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" className="max-md:size-11" aria-label={`Remove line ${i + 1}`} disabled={locked} onClick={() => set("salaryBreakup", data.salaryBreakup.filter((_, k) => k !== i))}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit max-md:min-h-11" disabled={locked || data.salaryBreakup.length >= 20} onClick={() => set("salaryBreakup", [...data.salaryBreakup, { label: "", monthly: "" }])}>
                <Plus aria-hidden="true" /> Add line
              </Button>
            </section>
          )}

          <div className="flex items-center gap-2 rounded-lg border p-4">
            <Switch id="o-outside" checked={data.includeOutsideWorkClause} onCheckedChange={(v) => set("includeOutsideWorkClause", v)} />
            <Label htmlFor="o-outside" className="font-normal">
              Include the outside work clause
            </Label>
          </div>
        </fieldset>

        {!view.ok && (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {view.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {locked && letter.isCurrent ? (
            <Button type="button" disabled={busy || !view.ok} onClick={() => save()} className="max-md:min-h-11">
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Create a new version
            </Button>
          ) : !locked ? (
            <>
              <Button type="button" disabled={busy || !view.ok || (!dirty && letter.id !== null)} onClick={() => save()} className="max-md:min-h-11">
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Save draft
              </Button>
              <Button type="button" variant="outline" disabled={busy || !view.ok} onClick={() => setConfirm("send")} className="max-md:min-h-11">
                <Send aria-hidden="true" /> Send to employee
              </Button>
              {letter.id && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm("delete")} className="max-md:min-h-11">
                  <Trash2 aria-hidden="true" /> Delete draft
                </Button>
              )}
            </>
          ) : null}
          {letter.id && (
            <Button asChild variant="outline" className="max-md:min-h-11">
              <a href={`/api/offers/${letter.id}/pdf`} target="_blank" rel="noopener noreferrer" aria-disabled={dirty}>
                <Download aria-hidden="true" /> {dirty ? "PDF (of the saved draft)" : "Open PDF"}
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" className="max-md:min-h-11">
            <Link href="/timesheet/admin/offers">Back to the list</Link>
          </Button>
        </div>
        {dirty && !locked && <p className="text-xs text-muted-foreground">You have unsaved changes.</p>}
      </div>

      <div className="min-w-0">
        {view.ok ? (
          <div className="max-h-[85vh] overflow-auto rounded-md bg-neutral-100 p-3">
            <LetterPreview letter={view.doc} logoUrl={logoUrl} />
          </div>
        ) : (
          <p role="note" className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            The live preview of the letter appears here as soon as the details are complete.
          </p>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "send" ? "Send this letter?" : "Delete this draft?"}</DialogTitle>
            <DialogDescription>
              {confirm === "send"
                ? "The PDF is stored on the employee's profile under Documents and the letter is locked. To change it later you create a new version. The employee can then accept it in the portal."
                : "The draft is removed. A letter that was already sent can't be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm === "send" ? send : remove}>
              {confirm === "send" ? "Send" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
