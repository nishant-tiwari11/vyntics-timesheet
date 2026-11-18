"use client";

import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChecklistItem, ChecklistState } from "@/lib/documents/config";

const STATE: Record<ChecklistState, { label: string; icon: React.ReactNode }> = {
  verified: { label: "Verified", icon: <CheckCircle2 className="size-4" aria-hidden="true" /> },
  pending: { label: "Uploaded, pending review", icon: <Clock className="size-4 text-muted-foreground" aria-hidden="true" /> },
  rejected: { label: "Rejected, upload again", icon: <XCircle className="size-4 text-destructive" aria-hidden="true" /> },
  missing: { label: "Missing", icon: <Circle className="size-4 text-muted-foreground/60" aria-hidden="true" /> },
};

// "5 of 8 uploaded", with each required document and whether it is in. Missing or rejected ones have an Upload button
// that opens the upload window with that category already chosen.
export function RequiredDocsChecklist({
  items,
  done,
  total,
  canUpload,
  onUpload,
}: {
  items: ChecklistItem[];
  done: number;
  total: number;
  canUpload: boolean;
  onUpload: (categoryId: string) => void;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <section aria-labelledby="required-title" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="required-title" className="text-base font-semibold">
          Required documents
        </h2>
        <p className="text-sm font-medium" role="status">
          {done} of {total} uploaded
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Required documents uploaded">
        <div className="h-full bg-foreground transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {items.map(({ category, state }) => (
          <li key={category.id} className="flex min-h-9 items-center gap-2 text-sm">
            {STATE[state].icon}
            <span className="min-w-0 flex-1">
              <span className={state === "missing" ? "" : "font-medium"}>{category.label}</span>
              <span className="sr-only">: {STATE[state].label}</span>
            </span>
            {canUpload && (state === "missing" || state === "rejected") && (
              <Button type="button" variant="outline" size="xs" className="max-md:min-h-9" onClick={() => onUpload(category.id)}>
                Upload
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
