"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, FilePlus2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { categoryLabel, kindFromName } from "@/lib/documents/config";
import type { AdminDoc, EmployeeDocs } from "@/lib/documents/admin";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { UserAvatar } from "../../../_components/UserAvatar";
import type { PreviewDoc } from "../../profile/documents/DocumentPreviewModal";
import type { ReviewTarget } from "../../profile/documents/ReviewDialog";

const profileLink = (id: string) => `/timesheet/admin/access/${id}`;

function Block({ title, count, note, children }: { title: string; count: number; note: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label={title}>
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          {title}
          <span className={`rounded-full px-2 text-xs font-medium ${count > 0 ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground"}`}>{count}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

const Clear = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>;

/** One "Upload ..." button for a letter that HR issues. The file goes straight to the employee's record. */
function LetterUpload({ userId, category, label }: { userId: string; category: "offer_letter" | "appointment_letter"; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(file: File) {
    if (!kindFromName(file.name)) return toast.error("Choose a PDF, DOC, DOCX, JPG or PNG file.");
    const form = new FormData();
    form.set("file", file);
    form.set("userId", userId);
    form.set("category", category);
    form.set("name", categoryLabel(category));
    form.set("visibility", "employee");
    setBusy(true);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) toast.error(body.error ?? "Couldn't upload. Please try again.");
      else {
        toast.success(`${label} added.`);
        router.refresh();
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" aria-label={`Upload ${label}`} onChange={(e) => (e.target.files?.[0] && send(e.target.files[0]), (e.target.value = ""))} />
      <Button type="button" size="sm" variant="outline" disabled={busy} className="max-md:min-h-11" onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
        {label}
      </Button>
    </>
  );
}

// What needs an admin right now: letters nobody has issued yet, documents waiting to be checked, and work sent back.
export function ActionRequired({
  docs,
  employees,
  pendingOnboarding,
  onOpenLetters,
  onOpenOnboarding,
  onPreview,
  onReview,
}: {
  docs: AdminDoc[];
  employees: EmployeeDocs[];
  pendingOnboarding: number;
  onOpenLetters: () => void;
  onOpenOnboarding: () => void;
  onPreview: (d: PreviewDoc) => void;
  onReview: (t: ReviewTarget) => void;
}) {
  const people = employees.filter((e) => e.role === "employee" || e.role === "manager");
  const hasLetter = (id: string, cat: string) => docs.some((d) => d.userId === id && d.category === cat && d.status !== "rejected");
  const toIssue = people.map((e) => ({ e, offer: !hasLetter(e.id, "offer_letter"), joining: !hasLetter(e.id, "appointment_letter") })).filter((r) => r.offer || r.joining);
  const toVerify = docs.filter((d) => d.status === "pending" && !["offer_letter", "appointment_letter"].includes(d.category));
  const sentBack = docs.filter((d) => d.status === "rejected");

  return (
    <div className="grid gap-4">
      {pendingOnboarding > 0 && (
        <button type="button" onClick={onOpenOnboarding} className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-left text-sm transition-colors hover:border-foreground">
          <span>
            <strong>{pendingOnboarding}</strong> {pendingOnboarding === 1 ? "employee hasn't" : "employees haven't"} finished onboarding yet.
          </span>
          <span className="font-medium underline underline-offset-4">See who</span>
        </button>
      )}

      <Block title="Letters to issue" count={toIssue.length} note="Upload each employee's offer letter and joining letter. They can download them when they sign in. Or create an offer letter from the template.">
        {toIssue.length === 0 ? (
          <Clear>Every employee has both letters.</Clear>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {toIssue.map(({ e, offer, joining }) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar userId={e.id} name={e.name} className="size-8 text-xs" />
                    <div className="min-w-0">
                      <Link href={profileLink(e.id)} className="font-medium hover:underline">
                        {e.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">Missing: {[offer && "offer letter", joining && "joining letter"].filter(Boolean).join(" and ")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offer && <LetterUpload userId={e.id} category="offer_letter" label="Upload offer letter" />}
                    {joining && <LetterUpload userId={e.id} category="appointment_letter" label="Upload joining letter" />}
                  </div>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onOpenLetters}>
              <FilePlus2 aria-hidden="true" /> Create an offer letter from the template
            </Button>
          </>
        )}
      </Block>

      <Block title="Documents to verify" count={toVerify.length} note="Submitted by employees and waiting for a check. Verify, or reject with a reason and the employee uploads it again.">
        {toVerify.length === 0 ? (
          <Clear>Nothing is waiting for a check.</Clear>
        ) : (
          <ul className="divide-y rounded-lg border">
            {toVerify.slice(0, 15).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{categoryLabel(d.category)}</p>
                  <p className="text-xs text-muted-foreground">
                    <Link href={profileLink(d.userId)} className="hover:underline">
                      {d.employeeName}
                    </Link>{" "}
                    · {formatInstantDate(d.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Preview ${d.name}`} onClick={() => onPreview({ id: d.id, name: d.name, mime: d.mime, version: d.version })}>
                    <Eye />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Verify ${d.name}`} onClick={() => onReview({ id: d.id, name: d.name, decision: "verified" })}>
                    <Check />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Reject ${d.name}`} onClick={() => onReview({ id: d.id, name: d.name, decision: "rejected" })}>
                    <X />
                  </Button>
                </div>
              </li>
            ))}
            {toVerify.length > 15 && <li className="px-3 py-2 text-xs text-muted-foreground">and {toVerify.length - 15} more in All documents.</li>}
          </ul>
        )}
      </Block>

      <Block title="Sent back to employees" count={sentBack.length} note="Rejected documents. The employee sees a notice and uploads a new one; nothing to do until they do.">
        {sentBack.length === 0 ? (
          <Clear>No rejected documents.</Clear>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sentBack.slice(0, 10).map((d) => (
              <li key={d.id} className="px-3 py-2.5 text-sm">
                <span className="font-medium">{categoryLabel(d.category)}</span> · {d.employeeName}
                {d.statusReason && <span className="block text-xs text-muted-foreground">Reason: {d.statusReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
