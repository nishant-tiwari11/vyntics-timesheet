"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLAUSE_FIELDS, CLAUSE_MAX, DEFAULT_CLAUSES, type ClauseKey } from "@/lib/offers/clauses";
import type { CompanyInfo } from "@/lib/offers/types";
import { saveOfferSettingsAction } from "../actions";

type Kind = "logo" | "signature" | "seal";
const PICTURES: { kind: Kind; label: string; hint: string }[] = [
  { kind: "logo", label: "Logo", hint: "Top left of every page. Square works best." },
  { kind: "signature", label: "Signature", hint: "A PNG with a transparent background looks best." },
  { kind: "seal", label: "Company seal", hint: "Drawn beside the signature." },
];

function Picture({ kind, label, hint, has, onChanged }: { kind: Kind; label: string; hint: string; has: boolean; onChanged: () => void }) {
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
      const res = await fetch("/api/documents/signing-assets", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) toast.error(body.error ?? "Couldn't upload the picture.");
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
    const res = await fetch(`/api/documents/signing-assets?kind=${kind}`, { method: "DELETE" }).catch(() => null);
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
          <img src={`/api/documents/signing-assets?kind=${kind}&image=1&v=${version}`} alt={`${label} preview`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">{kind === "logo" ? "Using the portal's logo" : "None yet"}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint} PNG or JPG up to 1 MB.</p>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Choose a ${label.toLowerCase()} picture`} onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} {has ? "Replace" : "Upload"}
        </Button>
        {has && (
          <Button type="button" variant="ghost" size="sm" className="max-md:min-h-11" disabled={busy} onClick={remove}>
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function OfferSettingsForm({ saved, ready, pictures }: { saved: { company: CompanyInfo; clauses: Record<ClauseKey, string> }; ready: boolean; pictures: Record<Kind, boolean> }) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyInfo>(saved.company);
  const [clauses, setClauses] = useState<Record<ClauseKey, string>>(saved.clauses);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify({ company, clauses }) !== JSON.stringify(saved);
  const field = (key: keyof CompanyInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setCompany((c) => ({ ...c, [key]: e.target.value }));

  function save() {
    startTransition(async () => {
      const res = await saveOfferSettingsAction(company, clauses);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Saved. New letters use these settings; letters already sent keep their PDF.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-lg border p-4" aria-label="Company details">
        <h2 className="text-base font-semibold">Company details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Company name</Label>
            <Input id="c-name" value={company.name} onChange={field("name")} maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-gstin">GSTIN</Label>
            <Input id="c-gstin" value={company.gstin} onChange={field("gstin")} maxLength={20} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="c-addr">Registered address</Label>
            <Input id="c-addr" value={company.registeredAddress} onChange={field("registeredAddress")} maxLength={300} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-city">City in the footer</Label>
            <Input id="c-city" value={company.city} onChange={field("city")} maxLength={80} placeholder="Jaipur Rajasthan" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-sname">Signatory name</Label>
            <Input id="c-sname" value={company.signatoryName} onChange={field("signatoryName")} maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-stitle">Signatory designation</Label>
            <Input id="c-stitle" value={company.signatoryTitle} onChange={field("signatoryTitle")} maxLength={100} placeholder="Founder" />
          </div>
        </div>
      </section>

      <section className="grid gap-3" aria-label="Pictures">
        <h2 className="text-base font-semibold">Pictures</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PICTURES.map((p) => (
            <Picture key={p.kind} {...p} has={pictures[p.kind]} onChanged={() => router.refresh()} />
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-label="Wording">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Wording of each clause</h2>
          <p className="text-sm text-muted-foreground">
            You can use <code>{"{{company}}"}</code>, <code>{"{{firstName}}"}</code>, <code>{"{{designation}}"}</code>, <code>{"{{joiningDate}}"}</code>, <code>{"{{noticeDays}}"}</code>, <code>{"{{ctc}}"}</code>, <code>{"{{workLocation}}"}</code> and the others already in the standard text. A blank line starts a new paragraph.
          </p>
        </div>
        {CLAUSE_FIELDS.map((c) => {
          const changed = clauses[c.key] !== DEFAULT_CLAUSES[c.key];
          return (
            <div key={c.key} className="grid gap-1.5 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`cl-${c.key}`} className="font-semibold">
                  {c.label}
                </Label>
                <span className="text-xs text-muted-foreground">Used in: {c.used}</span>
              </div>
              <Textarea id={`cl-${c.key}`} rows={4} maxLength={CLAUSE_MAX} value={clauses[c.key]} onChange={(e) => setClauses((x) => ({ ...x, [c.key]: e.target.value }))} />
              {changed && (
                <Button type="button" variant="ghost" size="sm" className="w-fit max-md:min-h-11" onClick={() => setClauses((x) => ({ ...x, [c.key]: DEFAULT_CLAUSES[c.key] }))}>
                  <RotateCcw aria-hidden="true" /> Use the standard wording
                </Button>
              )}
            </div>
          );
        })}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Button type="button" className="max-md:min-h-11" disabled={pending || !ready || !dirty} onClick={save}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Save settings
        </Button>
        {dirty && <p className="text-xs text-muted-foreground">You have unsaved changes.</p>}
        <p className="text-xs text-muted-foreground">Every change is written to the audit log.</p>
      </div>
    </div>
  );
}
