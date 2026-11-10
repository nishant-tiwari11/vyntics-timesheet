"use client";

import { useEffect, useRef, useState } from "react";
import { LazyWorkLogForm } from "./LazyForms";
import type { LogDraft } from "./WorkLogForm";

// A native <dialog>: Escape closes it, focus stays inside it, and clicking the dark area closes it.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="ts-dialog"
      aria-labelledby="ts-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="ts-dialog-body">
        <div className="ts-dialog-head">
          <h2 className="ts-dialog-title" id="ts-dialog-title">
            {title}
          </h2>
          <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function AddLogButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ts-btn" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> Add time log
      </button>
      {open && (
        <Modal title="Add time log" onClose={() => setOpen(false)}>
          <LazyWorkLogForm today={today} onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}

export function EditLogButton({ today, entry }: { today: string; entry: LogDraft }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => setOpen(true)}>
        Edit
      </button>
      {open && (
        <Modal title="Edit time log" onClose={() => setOpen(false)}>
          <LazyWorkLogForm today={today} initial={entry} onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
