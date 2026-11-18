"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, FilePlus2, FileText, Loader2, PencilLine, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmployeeDocs } from "@/lib/documents/admin";
import {
  DEFAULT_OFFER_TEMPLATE,
  OFFER_FIELD_LABEL,
  TEMPLATE_MAX,
  TEMPLATE_PLACEHOLDERS,
  checkOffer,
  checkTemplate,
  offerDefaults,
  offerLetter,
  previewFields,
  type OfferFields,
} from "@/lib/documents/offerLetter";

type Kind = "text" | "date" | "number";
// The details an admin fills in for each letter. The wording around them is the template, edited below.
const FIELDS: { key: keyof OfferFields; kind: Kind; wide?: boolean; hint?: string }[] = [
  { key: "name", kind: "text" },
  { key: "designation", kind: "text" },
  { key: "department", kind: "text" },
  { key: "location", kind: "text" },
  { key: "joiningDate", kind: "date" },
  { key: "ctc", kind: "text", hint: "For example: INR 6,00,000 per year" },
  { key: "reportingTo", kind: "text" },
  { key: "probationMonths", kind: "number" },
  { key: "noticeDays", kind: "number" },
  { key: "issueDate", kind: "date" },
  { key: "acceptBy", kind: "date" },
  { key: "company", kind: "text" },
  { key: "companyAddress", kind: "text", wide: true },
  { key: "signatoryName", kind: "text" },
  { key: "signatoryTitle", kind: "text" },
];

export type OfferTemplateInfo = { body: string; canSave: boolean; custom: boolean; kind: "text" | "docx"; fileName: string };

export function OfferLetterTab({ employees, today, template }: { employees: EmployeeDocs[]; today: string; template: OfferTemplateInfo }) {
  const [userId, setUserId] = useState("");
  const [fields, setFields] = useState<OfferFields>(() => offerDefaults(today));
  const [visibility, setVisibility] = useState<"employee" | "hr_only">("employee");
  const [busy, setBusy] = useState<"download" | "save" | "template" | "file" | null>(null);
  // The admin's own Word template, when one is uploaded. It is used instead of the wording below.
  const [docxName, setDocxName] = useState(template.kind === "docx" ? template.fileName : "");
  const fileInput = useRef<HTMLInputElement>(null);
  const docx = docxName !== "";
  // The signature and seal pictures.
  const [assets, setAssets] = useState({ signature: false, seal: false });
  const [pictureVersion, setPictureVersion] = useState(0);
  const [use, setUse] = useState({ signature: true, seal: true });
  const [pictureBusy, setPictureBusy] = useState<"signature" | "seal" | null>(null);
  const pictureInput = useRef<HTMLInputElement>(null);
  const pictureKind = useRef<"signature" | "seal">("signature");
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [tpl, setTpl] = useState(template.body);
  const [savedTpl, setSavedTpl] = useState(template.body);
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const tplCheck = checkTemplate(tpl);
  const usable = tplCheck.ok ? tplCheck.data : savedTpl; // the preview keeps working while the wording has a mistake
  const dirty = tplCheck.ok ? tplCheck.data !== savedTpl : tpl !== savedTpl;
  const letter = offerLetter(previewFields(fields), usable);
  const set = (key: keyof OfferFields, value: string) => setFields((f) => ({ ...f, [key]: value }));

  function choose(id: string) {
    setUserId(id);
    setSavedFor(null);
    const person = employees.find((e) => e.id === id);
    if (person) set("name", person.name);
  }

  function insert(text: string) {
    const el = area.current;
    const start = el?.selectionStart ?? tpl.length;
    const end = el?.selectionEnd ?? tpl.length;
    setTpl(tpl.slice(0, start) + text + tpl.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function saveTemplate() {
    if (!tplCheck.ok) return toast.error(tplCheck.error);
    setBusy("template");
    try {
      const res = await fetch("/api/documents/offer-template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: tpl }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setSavedTpl(tplCheck.data);
        setTpl(tplCheck.data);
        toast.success("Template saved. New letters will use it.");
      } else toast.error(body.error ?? "Couldn't save the template. Please try again.");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(null);
  }

  useEffect(() => {
    let live = true;
    fetch("/api/documents/signing-assets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { signature: boolean; seal: boolean } | null) => {
        if (live && b) setAssets({ signature: !!b.signature, seal: !!b.seal });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function uploadPicture(file: File | undefined) {
    const kind = pictureKind.current;
    if (pictureInput.current) pictureInput.current.value = "";
    if (!file) return;
    if (!/\.(png|jpe?g)$/i.test(file.name)) return toast.error("Use a PNG or JPG picture.");
    if (file.size > 1024 * 1024) return toast.error("That picture is over 1 MB.");
    setPictureBusy(kind);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const res = await fetch("/api/documents/signing-assets", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setAssets((a) => ({ ...a, [kind]: true }));
        setPictureVersion((v) => v + 1);
        toast.success(kind === "signature" ? "Signature saved." : "Seal saved.");
      } else toast.error(body.error ?? "Couldn't save the picture. Please try again.");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setPictureBusy(null);
  }

  async function removePicture(kind: "signature" | "seal") {
    setPictureBusy(kind);
    try {
      const res = await fetch(`/api/documents/signing-assets?kind=${kind}`, { method: "DELETE" });
      if (res.ok) {
        setAssets((a) => ({ ...a, [kind]: false }));
        toast.success("Removed.");
      } else toast.error("Couldn't remove the picture. Please try again.");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setPictureBusy(null);
  }

  async function uploadFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) return toast.error("Upload a Word file saved as .docx.");
    if (file.size > 2 * 1024 * 1024) return toast.error("That file is over 2 MB.");
    setBusy("file");
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/documents/offer-template/file", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fileName?: string; found?: string[] };
      if (res.ok && body.ok) {
        setDocxName(body.fileName ?? file.name);
        toast.success(`Template uploaded. It uses: ${(body.found ?? []).map((k) => `{{${k}}}`).join(", ")}`);
      } else toast.error(body.error ?? "Couldn't upload the template. Please try again.");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(null);
  }

  async function removeFile() {
    setBusy("file");
    try {
      const res = await fetch("/api/documents/offer-template/file", { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setDocxName("");
        toast.success("Word template removed. Letters use the wording again.");
      } else toast.error(body.error ?? "Couldn't remove the template. Please try again.");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(null);
  }

  async function send(save: boolean) {
    const checked = checkOffer(fields as unknown as Record<string, unknown>);
    if (!checked.ok) return toast.error(checked.error);
    if (!docx && !tplCheck.ok) return toast.error(`Fix the wording first: ${tplCheck.error}`);
    if (save && !userId) return toast.error("Choose the employee to save it for.");
    setBusy(save ? "save" : "download");
    try {
      const res = await fetch("/api/documents/offer-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fields, template: tplCheck.ok ? tplCheck.data : undefined, save, visibility, signature: assets.signature && use.signature, seal: assets.seal && use.seal }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't make the letter. Please try again.");
      } else if (save) {
        toast.success("Saved to the employee's documents as an Offer Letter.");
        setSavedFor(userId);
      } else {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = `Offer Letter - ${fields.name || "Employee"}.${docx ? "docx" : "pdf"}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(null);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" aria-label="Offer letter">
      <div className="grid content-start gap-4">
        <p className="text-sm text-muted-foreground">
          Pick an employee, fill in their details and download the letter, or save it straight to their profile. You can change the wording of the letter itself with <strong>Edit wording</strong>. Please have your HR or legal team approve the wording before you use it.
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="offer-employee">Employee</Label>
          <Select value={userId} onValueChange={choose}>
            <SelectTrigger id="offer-employee" className="w-full">
              <SelectValue placeholder="Choose an employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={`grid gap-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={`offer-${f.key}`}>{OFFER_FIELD_LABEL[f.key]}</Label>
              <Input
                id={`offer-${f.key}`}
                type={f.kind === "date" ? "date" : "text"}
                inputMode={f.kind === "number" ? "numeric" : undefined}
                value={fields[f.key]}
                maxLength={f.key === "companyAddress" ? 200 : f.kind === "number" ? 3 : 120}
                onChange={(e) => set(f.key, e.target.value)}
                className="max-md:h-11"
              />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="offer-vis">When saved, who can see it</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as "employee" | "hr_only")}>
            <SelectTrigger id="offer-vis" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Visible to employee</SelectItem>
              <SelectItem value="hr_only">HR only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="max-md:min-h-11" disabled={busy !== null} onClick={() => send(false)}>
            {busy === "download" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Download {docx ? "Word file" : "PDF"}
          </Button>
          <Button type="button" className="max-md:min-h-11" disabled={busy !== null || !userId} onClick={() => send(true)}>
            {busy === "save" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FilePlus2 aria-hidden="true" />} Save to profile
          </Button>
        </div>
        {savedFor && (
          <p className="text-sm" role="status">
            Saved.{" "}
            <Link href={`/timesheet/profile?user=${savedFor}&tab=documents`} className="underline">
              Open their documents
            </Link>
          </p>
        )}

        <div className="grid gap-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">Signature and seal</p>
          <input ref={pictureInput} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose a picture" onChange={(e) => uploadPicture(e.target.files?.[0])} />
          {(["signature", "seal"] as const).map((kind) => (
            <div key={kind} className="grid gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center">
              <div className="grid h-16 place-items-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]">
                {assets[kind] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private picture from our own authenticated route
                  <img src={`/api/documents/signing-assets?kind=${kind}&image=1&v=${pictureVersion}`} alt={`Your ${kind}`} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="px-1 text-center text-[11px] text-muted-foreground">None yet</span>
                )}
              </div>
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">{kind === "signature" ? "Signatory's signature" : "Company seal"}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-md:min-h-11"
                    disabled={pictureBusy !== null}
                    onClick={() => {
                      pictureKind.current = kind;
                      pictureInput.current?.click();
                    }}
                  >
                    {pictureBusy === kind ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} {assets[kind] ? "Replace" : "Upload"}
                  </Button>
                  {assets[kind] && (
                    <Button type="button" variant="outline" size="sm" className="text-destructive max-md:min-h-11" disabled={pictureBusy !== null} onClick={() => removePicture(kind)}>
                      <Trash2 aria-hidden="true" /> Remove
                    </Button>
                  )}
                </div>
                {assets[kind] && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={use[kind]} onChange={(e) => setUse((u) => ({ ...u, [kind]: e.target.checked }))} className="size-4 accent-foreground" />
                    Add it to the letter
                  </label>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">PNG or JPG up to 1 MB. A PNG with a transparent background looks best. Admins only. In your own Word template, type {"{{signature}}"} and {"{{seal}}"} each on a line of its own where the pictures go.</p>

        </div>

        <div className="grid gap-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">Letter template</p>
          <input
            ref={fileInput}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            aria-label="Choose a Word template"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />

          {docx ? (
            <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm">
              <p className="flex items-start gap-2 font-medium">
                <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  Using your Word template: <span className="font-normal break-all">{docxName}</span>
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Letters keep your formatting, logo and fonts. The {"{{details}}"} in your file are filled in, and the letter is a Word file you can still edit.</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
                  <a href="/api/documents/offer-template/file">
                    <Download aria-hidden="true" /> Download template
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                  {busy === "file" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} Replace file
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-destructive max-md:min-h-11" disabled={busy !== null} onClick={removeFile}>
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">Use your own letter: upload a Word (.docx) file with {"{{name}}"}, {"{{designation}}"} and so on typed where the details go.</p>
              <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy !== null || !template.canSave} onClick={() => fileInput.current?.click()}>
                {busy === "file" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} Upload Word template
              </Button>
            </div>
          )}
          {!template.canSave && !docx && (
            <p role="note" className="text-xs text-muted-foreground">
              Uploading isn&apos;t set up yet: run <code>supabase/step28_document_templates.sql</code> in Supabase.
            </p>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer font-medium">Details you can use in a Word file</summary>
            <ul className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <li key={p.key}>
                  <code>{`{{${p.key}}}`}</code> {p.label}
                </li>
              ))}
              <li>
                <code>{"{{signature}}"}</code> Signature picture
              </li>
              <li>
                <code>{"{{seal}}"}</code> Company seal picture
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Wrap a piece in <code>[[ … ]]</code> (on one line) to leave it out when a detail inside it is empty, for example <code>[[Your pay is {"{{ctc}}"}.]]</code>. The details also work in headers and footers.
            </p>
          </details>

          {!docx && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="text-sm font-semibold">
                  Letter wording {template.custom || dirty ? <span className="font-normal text-muted-foreground">(your own)</span> : <span className="font-normal text-muted-foreground">(built-in)</span>}
                </p>
                <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
                  <PencilLine aria-hidden="true" /> {editing ? "Hide wording" : "Edit wording"}
                </Button>
              </div>

          {editing && (
            <>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Click a detail to add it where your cursor is. It is replaced with the real value in every letter.</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_PLACEHOLDERS.map((p) => (
                    <Button key={p.key} type="button" variant="outline" size="xs" title={p.label} onClick={() => insert(`{{${p.key}}}`)}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="offer-template">Wording</Label>
                <Textarea id="offer-template" ref={area} value={tpl} rows={20} maxLength={TEMPLATE_MAX} spellCheck onChange={(e) => setTpl(e.target.value)} className="font-mono text-xs leading-relaxed" aria-invalid={!tplCheck.ok} aria-describedby="offer-template-help" />
                {!tplCheck.ok && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {tplCheck.error}
                  </p>
                )}
              </div>

              <ul id="offer-template-help" className="grid gap-1 text-xs text-muted-foreground">
                <li>
                  A blank line starts a new paragraph. The first line, <code>Subject: …</code>, is the subject.
                </li>
                <li>
                  <code>[[ … {"{{ctc}}"} … ]]</code> on one line is optional: it is left out when a detail inside it is empty.
                </li>
                <li>
                  <code>[space]</code> leaves room to sign. <code>---</code> starts the acceptance block at the bottom.
                </li>
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="max-md:min-h-11" disabled={busy !== null || !template.canSave || !dirty || !tplCheck.ok} onClick={saveTemplate}>
                  {busy === "template" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Save template
                </Button>
                <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={tpl === DEFAULT_OFFER_TEMPLATE} onClick={() => setTpl(DEFAULT_OFFER_TEMPLATE)}>
                  <RotateCcw aria-hidden="true" /> Use built-in wording
                </Button>
              </div>
              {!template.canSave && (
                <p role="note" className="text-xs text-muted-foreground">
                  Saving isn&apos;t set up yet: run <code>supabase/step28_document_templates.sql</code> in Supabase. You can still edit the wording and download letters with it.
                </p>
              )}
              {template.canSave && dirty && <p className="text-xs text-muted-foreground">You have unsaved changes. Downloads use what you see here; other admins see it only after you save.</p>}
            </>
          )}
            </>
          )}
        </div>
      </div>

      {docx ? (
        <div aria-label="Letter preview" className="grid min-w-0 content-center justify-items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <FileText className="size-8" aria-hidden="true" />
          <p className="font-medium text-foreground">Using your Word template</p>
          <p className="max-w-sm">A preview isn&apos;t shown for Word files. Choose an employee and fill in the details, then download the letter to check it. It keeps your own formatting.</p>
        </div>
      ) : (
      <div aria-label="Letter preview" className="min-w-0 rounded-md border bg-white p-6 text-sm leading-relaxed text-black shadow-sm sm:p-10">
        <p className="text-lg font-bold">{letter.company}</p>
        {letter.address && <p className="text-xs text-neutral-500">{letter.address}</p>}
        <hr className="my-3 border-black" />
        <p>Date: {letter.date}</p>
        <p className="mt-3 font-semibold">{letter.recipient}</p>
        {letter.subject && <p className="mt-3 font-semibold">Subject: {letter.subject}</p>}
        {letter.blocks.map((b, i) => (
          <div key={i} className="mt-3 break-words">
            {b.map((l, j) => (l === "[space]" ? <div key={j} className="h-6" /> : <p key={j} className={l === letter.signatory ? "font-semibold" : ""}>{l}</p>))}
          </div>
        ))}
        {letter.acceptance.length > 0 && <hr className="my-5 border-neutral-300" />}
        {letter.acceptance.map((b, i) => (
          <div key={i} className="mt-2 break-words">
            {b.map((l, j) => (l === "[space]" ? <div key={j} className="h-6" /> : <p key={j} className={i === 0 && j === 0 ? "font-semibold" : ""}>{l}</p>))}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
