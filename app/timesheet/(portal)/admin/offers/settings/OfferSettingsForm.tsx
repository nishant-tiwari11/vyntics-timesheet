"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clauseVars } from "@/lib/offers/build";
import {
  CLAUSE_FIELDS,
  CLAUSE_MAX,
  DEFAULT_CLAUSES,
  fillClause,
  type ClauseKey,
} from "@/lib/offers/clauses";
import { newLetter } from "@/lib/offers/defaults";
import type { CompanyInfo } from "@/lib/offers/types";
import { saveOfferSettingsAction } from "../actions";

type Kind = "logo" | "signature" | "seal";

// What each {{detail}} is called on screen, and an example of what it turns into.
const DETAIL_LABEL: Record<string, string> = {
  company: "Company name",
  firstName: "First name",
  name: "Full name",
  designation: "Role",
  joiningDate: "Joining date",
  workLocation: "Work location",
  reportingManager: "Reporting manager",
  noticeDays: "Notice days",
  nonCircumventionMonths: "Non-circumvention months",
  probationMonths: "Probation",
  ctc: "Annual CTC",
  stipend: "Stipend",
  periodStart: "Period start",
  periodEnd: "Period end",
  phaseCount: "Number of phases",
  phaseList: "List of phases",
  phaseMoney: "Pay for each phase",
  engagementWord: "internship / employment",
  inLieu: "Stipend in lieu of notice",
  ppoOutcome: "PPO outcome",
};
const COMMON_DETAILS = [
  "company",
  "firstName",
  "designation",
  "joiningDate",
  "workLocation",
  "noticeDays",
];

// The wording, grouped by the kind of letter it belongs to.
const GROUPS: {
  id: string;
  title: string;
  about: string;
  keys: ClauseKey[];
}[] = [
  {
    id: "internship",
    title: "Internship",
    about: "Unpaid and paid internships, which have one period.",
    keys: [
      "intro_internship",
      "engagement_period",
      "stipend_unpaid",
      "stipend_paid",
      "attendance",
      "ppo_row",
    ],
  },
  {
    id: "phased",
    title: "Phased internship",
    about: "Two or more phases, each evaluated.",
    keys: [
      "intro_phased",
      "phases_intro",
      "phases_evaluation",
      "phases_ppo",
      "stipend_phased",
      "outcome",
    ],
  },
  {
    id: "full_time",
    title: "Full-time",
    about: "Salary, probation, working hours and leave.",
    keys: [
      "intro_full_time",
      "employment_period",
      "salary",
      "probation",
      "working_hours",
      "leave",
    ],
  },
  {
    id: "all",
    title: "All letters",
    about: "Clauses every type has: confidentiality, IP, ethics and so on.",
    keys: [
      "responsibilities",
      "confidentiality",
      "intellectual_property",
      "ethics",
      "non_circumvention",
      "outside_work",
      "ending",
      "return_property",
      "acceptance_intro",
    ],
  },
];
const PICTURES: { kind: Kind; label: string; hint: string }[] = [
  {
    kind: "logo",
    label: "Logo",
    hint: "Top left of every page. Square works best.",
  },
  {
    kind: "signature",
    label: "Signature",
    hint: "A PNG with a transparent background looks best.",
  },
  { kind: "seal", label: "Company seal", hint: "Drawn beside the signature." },
];

function Picture({
  kind,
  label,
  hint,
  has,
  onChanged,
}: {
  kind: Kind;
  label: string;
  hint: string;
  has: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    try {
      const res = await fetch("/api/documents/signing-assets", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok)
        toast.error(body.error ?? "Couldn't upload the picture.");
      else {
        toast.success(`${label} saved.`);
        setVersion((v) => v + 1);
        onChanged();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/documents/signing-assets?kind=${kind}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return void toast.error("Couldn't remove it.");
    toast.success(`${label} removed.`);
    onChanged();
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex h-20 items-center justify-center rounded-md bg-muted/40">
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/documents/signing-assets?kind=${kind}&image=1&v=${version}`}
            alt={`${label} preview`}
            className="max-h-16 max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {kind === "logo" ? "Using the portal's logo" : "None yet"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {hint} PNG or JPG up to 1 MB.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        aria-label={`Choose a ${label.toLowerCase()} picture`}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:min-h-11"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}{" "}
          {has ? "Replace" : "Upload"}
        </Button>
        {has && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:min-h-11"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function OfferSettingsForm({
  saved,
  ready,
  pictures,
  onChanged,
}: {
  saved: { company: CompanyInfo; clauses: Record<ClauseKey, string> };
  ready: boolean;
  pictures: Record<Kind, boolean>;
  /** Something was saved: read the settings again. */ onChanged: () => void;
}) {
  const [company, setCompany] = useState<CompanyInfo>(saved.company);
  const [clauses, setClauses] = useState<Record<ClauseKey, string>>(
    saved.clauses,
  );
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState(GROUPS[0].id);
  // An example letter, so each clause can show how it will read with real details.
  const sample = useMemo(() => {
    const d = newLetter("2026-11-24", {
      name: "Asha Rao",
      email: "asha@example.com",
      manager: "Ravi Menon",
    });
    return clauseVars(
      {
        ...d,
        designation: "Intern",
        ctc: "600000",
        probationMonths: "3",
        phases: d.phases.map((ph) =>
          ph.isPaid ? { ...ph, monthlyAmount: "12000" } : ph,
        ),
      },
      company,
    );
  }, [company]);
  const dirty = JSON.stringify({ company, clauses }) !== JSON.stringify(saved);
  const field =
    (key: keyof CompanyInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setCompany((c) => ({ ...c, [key]: e.target.value }));

  function save() {
    startTransition(async () => {
      const res = await saveOfferSettingsAction(company, clauses);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        "Saved. New letters use these settings; letters already sent keep their PDF.",
      );
      onChanged();
    });
  }

  return (
    <div className="grid gap-6">
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-label="Company details"
      >
        <h2 className="text-base font-semibold">Company details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Company name</Label>
            <Input
              id="c-name"
              value={company.name}
              onChange={field("name")}
              maxLength={100}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-gstin">GSTIN</Label>
            <Input
              id="c-gstin"
              value={company.gstin}
              onChange={field("gstin")}
              maxLength={20}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="c-addr">Registered address</Label>
            <Input
              id="c-addr"
              value={company.registeredAddress}
              onChange={field("registeredAddress")}
              maxLength={300}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-city">City in the footer</Label>
            <Input
              id="c-city"
              value={company.city}
              onChange={field("city")}
              maxLength={80}
              placeholder="Jaipur Rajasthan"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-sname">Signatory name</Label>
            <Input
              id="c-sname"
              value={company.signatoryName}
              onChange={field("signatoryName")}
              maxLength={100}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-stitle">Signatory designation</Label>
            <Input
              id="c-stitle"
              value={company.signatoryTitle}
              onChange={field("signatoryTitle")}
              maxLength={100}
              placeholder="Founder"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3" aria-label="Pictures">
        <h2 className="text-base font-semibold">Pictures</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PICTURES.map((p) => (
            <Picture
              key={p.kind}
              {...p}
              has={pictures[p.kind]}
              onChanged={onChanged}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4" aria-label="Wording">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Wording of each clause</h2>
          <p className="text-sm text-muted-foreground">
            Pick the kind of letter, then change any clause. Click a detail
            button to put it into the text: it is replaced by the real name,
            date or amount in each letter. A blank line starts a new paragraph.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Kind of letter"
          className="flex flex-wrap gap-2"
        >
          {GROUPS.map((g) => {
            const changed = CLAUSE_FIELDS.filter(
              (c) =>
                g.keys.includes(c.key) &&
                clauses[c.key] !== DEFAULT_CLAUSES[c.key],
            ).length;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={tab === g.id}
                onClick={() => setTab(g.id)}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:border-foreground aria-selected:border-foreground aria-selected:bg-foreground aria-selected:text-background max-md:min-h-11"
              >
                {g.title}
                {changed > 0 && (
                  <span className="rounded-full bg-background/20 px-1.5 text-xs">
                    {changed} edited
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {GROUPS.filter((g) => g.id === tab).map((g) => (
          <div key={g.id} role="tabpanel" className="grid gap-3">
            <p className="text-sm text-muted-foreground">{g.about}</p>
            {CLAUSE_FIELDS.filter((c) => g.keys.includes(c.key)).map((c) => {
              const changed = clauses[c.key] !== DEFAULT_CLAUSES[c.key];
              // The details this clause uses in the standard wording, plus the common ones.
              const used = [
                ...DEFAULT_CLAUSES[c.key].matchAll(
                  /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g,
                ),
              ].map((m) => m[1]);
              const buttons = [...new Set([...COMMON_DETAILS, ...used])].filter(
                (k) => DETAIL_LABEL[k],
              );
              const insert = (key: string) => {
                const el = document.getElementById(
                  `cl-${c.key}`,
                ) as HTMLTextAreaElement | null;
                const at = el?.selectionStart ?? clauses[c.key].length;
                const to = el?.selectionEnd ?? at;
                const text = clauses[c.key];
                setClauses((x) => ({
                  ...x,
                  [c.key]: `${text.slice(0, at)}{{${key}}}${text.slice(to)}`,
                }));
                requestAnimationFrame(() => {
                  el?.focus();
                  el?.setSelectionRange(
                    at + key.length + 4,
                    at + key.length + 4,
                  );
                });
              };
              return (
                <details key={c.key} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-sm font-semibold">{c.label}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {fillClause(clauses[c.key], sample)
                          .replace(/\s+/g, " ")
                          .slice(0, 110)}
                        …
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {changed && (
                        <span className="rounded-full border px-2 py-0.5">
                          Edited
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className="transition-transform group-open:rotate-180"
                      >
                        ▾
                      </span>
                      <span className="sr-only">Show or hide this clause</span>
                    </span>
                  </summary>
                  <div className="grid gap-2 border-t p-4">
                    <p className="text-xs text-muted-foreground">
                      Appears in: {c.used}
                    </p>
                    <Label htmlFor={`cl-${c.key}`} className="sr-only">
                      {c.label}
                    </Label>
                    <Textarea
                      id={`cl-${c.key}`}
                      rows={4}
                      maxLength={CLAUSE_MAX}
                      value={clauses[c.key]}
                      onChange={(e) =>
                        setClauses((x) => ({ ...x, [c.key]: e.target.value }))
                      }
                    />
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      aria-label="Add a detail"
                    >
                      <span className="text-xs text-muted-foreground">
                        Add:
                      </span>
                      {buttons.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => insert(k)}
                          className="rounded-full border px-2.5 py-0.5 text-xs hover:border-foreground max-md:min-h-9"
                          title={`Inserts {{${k}}}`}
                        >
                          {DETAIL_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-md bg-muted/40 p-3 text-sm">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        How it reads (example)
                      </p>
                      {fillClause(clauses[c.key], sample)
                        .split(/\n\s*\n/)
                        .filter(Boolean)
                        .map((para, i) => (
                          <p key={i} className="mt-1.5 first:mt-0">
                            {para}
                          </p>
                        ))}
                    </div>
                    {changed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit max-md:min-h-11"
                        onClick={() =>
                          setClauses((x) => ({
                            ...x,
                            [c.key]: DEFAULT_CLAUSES[c.key],
                          }))
                        }
                      >
                        <RotateCcw aria-hidden="true" /> Use the standard
                        wording
                      </Button>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        ))}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Button
          type="button"
          className="max-md:min-h-11"
          disabled={pending || !ready || !dirty}
          onClick={save}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}{" "}
          Save settings
        </Button>
        {dirty && (
          <p className="text-xs text-muted-foreground">
            You have unsaved changes.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Every change is written to the audit log.
        </p>
      </div>
    </div>
  );
}
