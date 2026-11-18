"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KIND_MIME, canPreview } from "@/lib/documents/config";

export type PreviewDoc = { id: string; name: string; mime: string; version: number };

// Shows a PDF or an image inside the page without downloading it. Other kinds (Word) can only be downloaded.
// The file comes from the authenticated download route, so the same checks apply as for a download.
export function DocumentPreviewModal({ doc, onClose }: { doc: PreviewDoc | null; onClose: () => void }) {
  const src = doc ? `/api/documents/${doc.id}/download` : "";
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{doc?.name}</DialogTitle>
          <DialogDescription>{doc && doc.version > 1 ? `Version ${doc.version}` : "Preview"}</DialogDescription>
        </DialogHeader>
        {doc && (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
            {!canPreview(doc.mime) ? (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                <p>This kind of file can&apos;t be previewed here. Download it to open it.</p>
              </div>
            ) : doc.mime === KIND_MIME.pdf ? (
              <iframe title={`Preview of ${doc.name}`} src={`${src}?inline=1`} className="size-full min-h-[60dvh]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a private file from our own authenticated route
              <img src={`${src}?inline=1`} alt={doc.name} className="mx-auto max-h-full max-w-full object-contain" />
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <a href={src} download>
              <Download aria-hidden="true" /> Download
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
