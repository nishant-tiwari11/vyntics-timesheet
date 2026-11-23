"use client";

import { Download, Eye, FileClock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/documents/config";
import type { DocRow } from "@/lib/documents/server";
import { neededDocs, type Answers } from "@/lib/onboarding/rules";
import { UploadSlot } from "../../onboarding/UploadSlot";

const LETTERS = [
  { category: "offer_letter", label: "Offer letter" },
  { category: "appointment_letter", label: "Joining letter" },
] as const;

// An employee's own documents, in two parts. What HR issues (offer and joining letters): "to be uploaded by HR" until it is there,
// then view and download. What the employee handed in: its status, the reason when HR sent it back, and a button to upload it again.
// Nothing here blocks the portal: only submitting onboarding does that, not waiting for HR to check the files.
export function MyDocuments({ docs, answers }: { docs: DocRow[]; answers: Answers }) {
  const mine = neededDocs(answers);
  const sentBack = docs.filter((d) => d.status === "rejected" && d.visibility === "employee" && !mine.some((n) => n.category === d.category));

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-xl border bg-card p-5" aria-label="From HR">
        <div>
          <h2 className="text-base font-semibold">From HR</h2>
          <p className="text-sm text-muted-foreground">Your offer and joining letters. HR uploads them for you.</p>
        </div>
        <ul className="grid gap-2">
          {LETTERS.map((l) => {
            const doc = docs.find((d) => d.category === l.category);
            return (
              <li key={l.category} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {doc ? <FileText className="size-4 text-muted-foreground" aria-hidden="true" /> : <FileClock className="size-4 text-muted-foreground" aria-hidden="true" />}
                  {l.label}
                </span>
                {doc ? (
                  <span className="flex items-center gap-2">
                    <a href={`/api/documents/${doc.id}/download?inline=1`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent">
                      <Eye className="size-4" aria-hidden="true" /> View
                    </a>
                    <a href={`/api/documents/${doc.id}/download`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent">
                      <Download className="size-4" aria-hidden="true" /> Download
                    </a>
                  </span>
                ) : (
                  <Badge variant="outline" className="border-dashed">
                    Pending: to be uploaded by HR
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-5" aria-label="Your documents">
        <div>
          <h2 className="text-base font-semibold">Your documents</h2>
          <p className="text-sm text-muted-foreground">What you submitted. If HR sends one back you will see the reason here, and you can upload a new one.</p>
        </div>
        <div className="grid gap-3">
          {mine.map((n) => (
            <UploadSlot key={n.category} category={n.category} label={n.label} hint={n.hint} docs={docs} multiple={n.category === "marksheets"} locked={false} replaceable />
          ))}
          {sentBack.map((d) => (
            <UploadSlot key={d.id} category={d.category} label={categoryLabel(d.category)} hint="HR sent this back." docs={[d]} locked={false} replaceable />
          ))}
          {mine.length === 0 && sentBack.length === 0 && (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Complete your onboarding to see what to submit.</p>
          )}
        </div>
      </section>
    </div>
  );
}

