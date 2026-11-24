"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { LetterPreview } from "@/components/offers/LetterPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LetterDoc } from "@/lib/offers/types";

export type MyOfferView = {
  id: string;
  status: "sent" | "accepted";
  version: number;
  typeLabel: string;
  sentOn: string | null;
  acceptedOn: string | null;
  acceptedName: string | null;
  method: "typed" | "upload" | null;
  isCurrent: boolean;
  doc: LetterDoc;
};

// Your offer letter: read it, download the PDF, and accept it by typing your name and the date, or by uploading a signed copy.
// After you accept it is locked; any change HR makes afterwards is a new version you'd be asked to accept again.
export function MyOffer({ offer, today, logoUrl, signatureUrl, sealUrl }: { offer: MyOfferView; today: string; logoUrl?: string; signatureUrl?: string; sealUrl?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"typed" | "upload" | null>(null);
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const accepted = offer.status === "accepted";

  async function send(method: "typed" | "upload", form: FormData) {
    setBusy(method);
    form.set("method", method);
    try {
      const res = await fetch(`/api/offers/${offer.id}/accept`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) toast.error(body.error ?? "Couldn't record your acceptance. Please try again.");
      else {
        toast.success("Thank you. You have accepted the offer.");
        router.refresh();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(null);
  }

  function acceptTyped(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return void toast.error("Type your full name.");
    if (!confirmed) return void toast.error("Tick the box to confirm you accept the offer.");
    const form = new FormData();
    form.set("name", name.trim());
    form.set("date", date);
    form.set("confirm", "yes");
    void send("typed", form);
  }

  return (
    <section aria-labelledby="my-offer-title" className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="my-offer-title" className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-5 text-muted-foreground" aria-hidden="true" /> Your offer letter
          </h2>
          <p className="text-sm text-muted-foreground">
            {offer.typeLabel}
            {offer.version > 1 ? `, version ${offer.version}` : ""}
            {offer.sentOn ? `. Sent on ${offer.sentOn}.` : "."}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${accepted ? "border-foreground bg-foreground text-background" : ""}`}>
          {accepted && <CheckCircle2 className="size-4" aria-hidden="true" />}
          {accepted ? "Accepted" : "Waiting for you"}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="max-md:min-h-11" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide the letter" : "Read the letter"}
        </Button>
        <Button asChild variant="outline" className="max-md:min-h-11">
          <a href={`/api/offers/${offer.id}/pdf`} target="_blank" rel="noopener noreferrer">
            Open the PDF
          </a>
        </Button>
      </div>

      {open && (
        <div className="max-h-[80vh] overflow-auto rounded-md bg-neutral-100 p-2">
          <LetterPreview letter={offer.doc} logoUrl={logoUrl} signatureUrl={signatureUrl} sealUrl={sealUrl} />
        </div>
      )}

      {accepted ? (
        <p className="rounded-md border border-dashed p-3 text-sm" role="status">
          You accepted this offer{offer.method === "typed" ? ` by typing "${offer.acceptedName}"` : " with a signed copy"}
          {offer.acceptedOn ? ` on ${offer.acceptedOn}` : ""}. The letter is locked. If HR needs to change it, you will get a new version to accept.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={acceptTyped} className="grid content-start gap-3 rounded-lg border p-4" aria-label="Accept in the portal">
            <h3 className="text-sm font-semibold">Accept here</h3>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-name">Type your full name</Label>
              <Input id="offer-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" disabled={busy !== null} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offer-date">Date</Label>
              <Input id="offer-date" type="date" value={date} min={today} max={today} onChange={(e) => setDate(e.target.value)} disabled={busy !== null} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="offer-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} disabled={busy !== null} />
              <Label htmlFor="offer-confirm" className="cursor-pointer font-normal leading-snug">
                I have read this offer letter and I accept it on the terms stated.
              </Label>
            </div>
            <Button type="submit" disabled={busy !== null} className="w-fit max-md:min-h-11">
              {busy === "typed" && <Loader2 className="animate-spin" aria-hidden="true" />} Accept the offer
            </Button>
          </form>

          <div className="grid content-start gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Or upload a signed copy</h3>
            <p className="text-sm text-muted-foreground">Print the PDF, sign it, and upload a scan or a clear photo (PDF, JPG, PNG or WebP, up to 8 MB).</p>
            <input
              ref={file}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Choose the signed copy"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.set("file", f);
                void send("upload", form).finally(() => {
                  if (file.current) file.current.value = "";
                });
              }}
            />
            <Button type="button" variant="outline" disabled={busy !== null} className="w-fit max-md:min-h-11" onClick={() => file.current?.click()}>
              {busy === "upload" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} Upload signed copy
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
