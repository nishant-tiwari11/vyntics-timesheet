"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { BILL_ACCEPT, BILL_MAX_BYTES, BILL_MAX_PER_CLAIM, BILL_TYPES_TEXT, fmtSize, type Bill } from "@/lib/expenses/billFile";

const URL_BASE = "/timesheet/expenses/bills";

type Done = { ok: true } | { ok: false; error: string };

/** Send one bill to the server. Checks the size here too so a huge file is refused before it is sent. */
export async function uploadBill(claimId: string, file: File): Promise<Done> {
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` };
  if (file.size > BILL_MAX_BYTES) return { ok: false, error: `${file.name} is too large. Use a file up to 8 MB.` };
  const form = new FormData();
  form.set("claimId", claimId);
  form.set("file", file);
  try {
    const res = await fetch(URL_BASE, { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (body?.ok) return { ok: true };
    return { ok: false, error: body?.error ?? (res.status === 401 || res.redirected ? "Please sign in again." : "Couldn't upload the bill. Please try again.") };
  } catch {
    return { ok: false, error: "Couldn't upload the bill. Check your connection and try again." };
  }
}

async function deleteBill(id: string): Promise<Done> {
  try {
    const res = await fetch(`${URL_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return body?.ok ? { ok: true } : { ok: false, error: body?.error ?? "Couldn't remove the bill. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't remove the bill. Check your connection and try again." };
  }
}

/** The bills of a claim as links that open the file in a new tab. Nothing to change here: it is for whoever is reading the claim. */
export function BillLinks({ bills }: { bills: Bill[] }) {
  if (bills.length === 0) return <span className="text-muted-foreground">No bill</span>;
  return (
    <ul className="grid gap-1">
      {bills.map((b) => (
        <li key={b.id}>
          <a href={`${URL_BASE}?id=${b.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-44 items-center gap-1.5 underline underline-offset-4" title={`${b.name} (${fmtSize(b.size)})`}>
            {b.mime === "application/pdf" ? <FileText className="size-4 shrink-0" aria-hidden="true" /> : <ImageIcon className="size-4 shrink-0" aria-hidden="true" />}
            <span className="truncate">{b.name}</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Your own claim's bills: see them, and (while the claim is a draft or waiting for approval) add more or remove one. */
export function BillsCell({ claimId, bills, canChange }: { claimId: string; bills: Bill[]; canChange: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = BILL_MAX_PER_CLAIM - bills.length;
    if (files.length > room) toast.error(`You can attach ${BILL_MAX_PER_CLAIM} bills to one expense. Only the first ${Math.max(room, 0)} will be added.`);
    setBusy("add");
    for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
      const res = await uploadBill(claimId, file);
      if (!res.ok) toast.error(res.error);
      else toast.success(`${file.name} attached.`);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function remove(b: Bill) {
    setBusy(b.id);
    const res = await deleteBill(b.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Bill removed.");
    router.refresh();
  }

  return (
    <div className="grid gap-1.5 text-sm">
      {bills.length === 0 ? (
        <span className="text-muted-foreground">No bill</span>
      ) : (
        <ul className="grid gap-1">
          {bills.map((b) => (
            <li key={b.id} className="flex items-center gap-1">
              <a href={`${URL_BASE}?id=${b.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-40 items-center gap-1.5 underline underline-offset-4" title={`${b.name} (${fmtSize(b.size)})`}>
                {b.mime === "application/pdf" ? <FileText className="size-4 shrink-0" aria-hidden="true" /> : <ImageIcon className="size-4 shrink-0" aria-hidden="true" />}
                <span className="truncate">{b.name}</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {canChange && (
                <button type="button" onClick={() => remove(b)} disabled={busy !== null} aria-label={`Remove ${b.name}`} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground max-md:size-9">
                  {busy === b.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canChange && bills.length < BILL_MAX_PER_CLAIM && (
        <>
          <input ref={input} type="file" accept={BILL_ACCEPT} multiple className="sr-only" id={`bill-${claimId}`} onChange={(e) => void add(e.target.files)} disabled={busy !== null} />
          <label htmlFor={`bill-${claimId}`} className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted max-md:min-h-11" title={BILL_TYPES_TEXT}>
            {busy === "add" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="size-3.5" aria-hidden="true" />} Add bill
          </label>
        </>
      )}
    </div>
  );
}
