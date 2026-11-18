"use client";

import { useState } from "react";
import type { ChecklistItem } from "@/lib/documents/config";
import type { DocRow } from "@/lib/documents/server";
import { DocumentList } from "./DocumentList";
import { DocumentPreviewModal, type PreviewDoc } from "./DocumentPreviewModal";
import { DocumentUploader } from "./DocumentUploader";
import { RequiredDocsChecklist } from "./RequiredDocsChecklist";
import { UploadDialog } from "./UploadDialog";

type Upload = { id: number; files: File[]; preset?: string; replace?: { id: string; category: string; name: string } };

// Holds what the Documents tab shares: which upload window is open, and which document is being previewed.
export function DocumentsWorkspace({
  userId,
  docs,
  versions,
  checklist,
  today,
  isAdmin,
  canEdit,
}: {
  userId: string;
  docs: DocRow[];
  versions: Record<string, DocRow[]>;
  checklist: { items: ChecklistItem[]; done: number; total: number };
  today: string;
  isAdmin: boolean;
  canEdit: boolean;
}) {
  const [upload, setUpload] = useState<Upload | null>(null);
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const canUpload = isAdmin || canEdit;
  const next = (u: Omit<Upload, "id">) => setUpload((cur) => ({ id: (cur?.id ?? 0) + 1, ...u }));

  // The checklist's Upload button opens a file picker, then the window with that category already chosen.
  function pickFor(categoryId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length > 0) next({ files, preset: categoryId });
    };
    input.click();
  }

  return (
    <div className="grid gap-5">
      <RequiredDocsChecklist {...checklist} canUpload={canUpload} onUpload={pickFor} />
      {canUpload && <DocumentUploader onFiles={(files) => next({ files })} />}
      <DocumentList
        docs={docs}
        versions={versions}
        today={today}
        isAdmin={isAdmin}
        canEdit={canEdit}
        onPreview={(d) => setPreview({ id: d.id, name: d.name, mime: d.mime, version: d.version })}
        onReplace={(d) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) next({ files: [file], replace: { id: d.id, category: d.category, name: d.name } });
          };
          input.click();
        }}
      />
      {upload && <UploadDialog key={upload.id} files={upload.files} userId={userId} isAdmin={isAdmin} presetCategory={upload.preset} replace={upload.replace} onClose={() => setUpload(null)} />}
      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
