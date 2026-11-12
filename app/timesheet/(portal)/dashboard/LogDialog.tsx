"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LazyWorkLogForm } from "./LazyForms";
import { ModalContext } from "./ModalContext";
import type { LogDraft } from "./WorkLogForm";

// A centred pop-up window (the shadcn Dialog): dimmed, blurred backdrop, focus kept inside, the page behind
// can't scroll, Esc or a click outside or the X closes it, and focus goes back to the button that opened it.
// If the form inside has unsaved input, closing asks "Discard your changes?" first.
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  const api = useMemo(() => ({ setDirty, requestClose }), [requestClose]);

  return (
    <ModalContext.Provider value={api}>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard your changes?</DialogTitle>
            <DialogDescription>What you typed hasn&apos;t been saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAsking(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAsking(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModalContext.Provider>
  );
}

export function AddLogButton({
  today,
  date,
  label = "Add time log",
  variant = "default",
  size = "default",
  floating = false,
}: {
  today: string;
  /** The day a new entry starts on. Defaults to today. */
  date?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  /** A round "+" button fixed to the corner of the screen on phones (the normal button hides there). */
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {floating ? (
        <Button
          type="button"
          size="icon"
          className="fixed right-4 bottom-4 z-40 size-14 rounded-full shadow-lg md:hidden"
          aria-label="Add time log"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-6" aria-hidden="true" />
        </Button>
      ) : (
        <Button type="button" variant={variant} size={size} className="max-md:min-h-11" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" /> {label}
        </Button>
      )}
      {open && (
        <Modal title="Add time log" description="Record what you worked on and for how long." onClose={() => setOpen(false)}>
          <LazyWorkLogForm today={today} defaultDate={date} onSaved={() => setOpen(false)} />
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
        <Modal title="Edit time log" description="Change the details, then save." onClose={() => setOpen(false)}>
          <LazyWorkLogForm today={today} initial={entry} onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
