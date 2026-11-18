"use client";

import { useRef, useState } from "react";
import { Plus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTR } from "@/lib/documents/config";

// The drag-and-drop area and the "+ Upload document" button. They only collect files; the UploadDialog does the rest.
export function DocumentUploader({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
    if (input.current) input.current.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${over ? "border-foreground bg-muted" : "border-input"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <UploadCloud className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-medium">Drag and drop files here</span>
          <span className="block text-muted-foreground">PDF, DOC, DOCX, JPG or PNG, up to 10 MB each</span>
        </p>
      </div>
      <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" aria-label="Choose documents to upload" onChange={(e) => take(e.target.files)} />
      <Button type="button" className="max-md:min-h-11" onClick={() => input.current?.click()}>
        <Plus aria-hidden="true" /> Upload document
      </Button>
    </div>
  );
}
