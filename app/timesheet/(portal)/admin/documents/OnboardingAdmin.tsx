"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Check, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPES, maskAccount } from "@/lib/onboarding/rules";
import type { OnboardingRow } from "@/lib/onboarding/server";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { UserAvatar } from "../../../_components/UserAvatar";
import type { PreviewDoc } from "../../profile/documents/DocumentPreviewModal";
import { StatusBadge } from "../../profile/documents/DocumentList";
import type { ReviewTarget } from "../../profile/documents/ReviewDialog";
import { reopenOnboardingAction, revealAccountAction, sendReminderAction } from "./actions";

const LABEL: Record<OnboardingRow["status"], string> = { not_started: "Not started", in_progress: "In progress", submitted: "Submitted" };

function Details({ row, onPreview, onReview }: { row: OnboardingRow; onPreview: (d: PreviewDoc) => void; onReview: (t: ReviewTarget) => void }) {
  const router = useRouter();
  const [account, setAccount] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const b = row.answers.bank;

  function reveal() {
    startTransition(async () => {
      const res = await revealAccountAction(row.userId);
      if (res.ok) setAccount(res.value);
      else toast.error(res.error);
    });
  }
  function reopen() {
    startTransition(async () => {
      const res = await reopenOnboardingAction(row.userId);
      if (res.ok) {
        toast.success("Reopened. The employee can edit their answers again.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const fact = (label: string, value: string) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{value || "-"}</dd>
    </div>
  );

  return (
    <div className="grid gap-4 border-t bg-muted/20 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Bank details" className="grid gap-2">
          <h3 className="text-sm font-semibold">Bank account</h3>
          {b.account ? (
            <dl className="grid grid-cols-2 gap-3">
              {fact("Account holder", b.holder)}
              {fact("Bank", b.bankName)}
              <div>
                <dt className="text-xs text-muted-foreground">Account number</dt>
                <dd className="flex items-center gap-2 text-sm font-medium tabular-nums">
                  {account ?? maskAccount(b.account)}
                  {account === null && (
                    <Button type="button" size="sm" variant="ghost" onClick={reveal} disabled={pending}>
                      Show
                    </Button>
                  )}
                </dd>
              </div>
              {fact("IFSC", b.ifsc)}
              {fact("Branch", b.branch)}
              {fact("Type", ACCOUNT_TYPES.find((t) => t.id === b.type)?.label ?? "")}
              {fact("Confirmed by employee", b.confirmed ? "Yes" : "No")}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Not filled in yet.</p>
          )}
        </section>

        <section aria-label="Background" className="grid gap-2">
          <h3 className="text-sm font-semibold">Education and experience</h3>
          <dl className="grid grid-cols-2 gap-3">
            {fact("Education", row.answers.degreeMode === "degree" ? "Has the degree certificate" : row.answers.degreeMode === "marksheets" ? "Submitting semester marksheets" : "")}
            {fact("Past experience", row.answers.hasExperience === null ? "" : row.answers.hasExperience ? "Yes" : "No")}
            {row.answers.hasExperience && fact("Previous role", row.answers.experienceType === "paid" ? "Paid" : row.answers.experienceType === "free_internship" ? "Free internship" : "")}
          </dl>
        </section>
      </div>

      <section aria-label="Documents" className="grid gap-2">
        <h3 className="text-sm font-semibold">Documents</h3>
        <ul className="grid gap-2">
          {row.items.map((it) => (
            <li key={it.category} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span>{it.label}</span>
              {it.doc ? (
                <span className="flex items-center gap-2">
                  <StatusBadge status={it.doc.status} />
                  <Button type="button" variant="outline" size="icon-sm" aria-label={`Preview ${it.label}`} onClick={() => onPreview({ id: it.doc!.id, name: it.doc!.name, mime: it.doc!.mime, version: it.doc!.version })}>
                    <Eye />
                  </Button>
                  {it.doc.status !== "verified" && (
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Verify ${it.label}`} onClick={() => onReview({ id: it.doc!.id, name: it.doc!.name, decision: "verified" })}>
                      <Check />
                    </Button>
                  )}
                  {it.doc.status !== "rejected" && (
                    <Button type="button" variant="outline" size="icon-sm" aria-label={`Reject ${it.label}`} onClick={() => onReview({ id: it.doc!.id, name: it.doc!.name, decision: "rejected" })}>
                      <X />
                    </Button>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Not uploaded</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {row.status === "submitted" && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Submitted {row.submittedAt ? formatInstantDate(row.submittedAt) : ""}.</span>
          <Button type="button" size="sm" variant="outline" onClick={reopen} disabled={pending}>
            Reopen for editing
          </Button>
        </div>
      )}
    </div>
  );
}

// Everyone who has to onboard: how far they are, what they gave, and the documents to check.
export function OnboardingAdmin({ rows, onPreview, onReview }: { rows: OnboardingRow[]; onPreview: (d: PreviewDoc) => void; onReview: (t: ReviewTarget) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function remind(r: OnboardingRow) {
    startTransition(async () => {
      const res = await sendReminderAction(r.userId);
      if (res.ok) {
        setReminded((s) => new Set(s).add(r.userId));
        toast.success(res.message ?? "Reminder sent.");
      } else toast.error(res.error);
    });
  }

  if (rows.length === 0) return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No employees to onboard yet.</p>;
  const count = (s: OnboardingRow["status"]) => rows.filter((r) => r.status === s).length;

  return (
    <section className="grid gap-3" aria-label="Onboarding">
      <ul className="grid grid-cols-3 gap-3" aria-label="Summary">
        {(["submitted", "in_progress", "not_started"] as const).map((s) => (
          <li key={s} className="rounded-xl border bg-card p-3">
            <span className="block text-xs text-muted-foreground">{LABEL[s]}</span>
            <span className="text-2xl font-semibold tabular-nums">{count(s)}</span>
          </li>
        ))}
      </ul>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((r) => {
          const done = r.items.filter((i) => i.doc && i.doc.status !== "rejected").length;
          const expanded = open === r.userId;
          return (
            <li key={r.userId}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar userId={r.userId} name={r.name} className="size-9 text-sm" />
                  <div className="min-w-0">
                    <Link href={`/timesheet/admin/access/${r.userId}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-xs break-all text-muted-foreground">{r.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={r.status === "submitted" ? "border-foreground" : r.status === "not_started" ? "border-dashed" : ""}>
                    {LABEL[r.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {done} of {r.items.length} files
                  </span>
                  {r.status !== "submitted" && (
                    <Button type="button" size="sm" variant="outline" disabled={reminded.has(r.userId)} onClick={() => remind(r)}>
                      <Bell aria-hidden="true" /> {reminded.has(r.userId) ? "Reminded" : "Remind"}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.userId)}>
                    {expanded ? "Hide" : "Details"}
                  </Button>
                </div>
              </div>
              {expanded && <Details row={r} onPreview={onPreview} onReview={onReview} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
