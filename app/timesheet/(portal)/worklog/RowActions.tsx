"use client";

import { useState, useTransition } from "react";
import { CopyPlus, Loader2, Lock, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatYmd } from "@/lib/timesheet/dates";
import { adminDeleteLogAction } from "../admin/logActions";
import { deleteLogAction } from "../dashboard/actions";
import { LazyDecideLogButtons, LazyWorkLogForm } from "../dashboard/LazyForms";
import { Modal } from "../dashboard/LogDialog";
import { clock12, fmtDuration, type Entry } from "./model";

type Dialogs = "edit" | "duplicate" | "fix" | "delete" | null;

/**
 * The actions for one entry: a "..." menu (Edit, Duplicate, Delete), a lock icon with the reason when the entry
 * can't be changed, "Fix and resubmit" for a rejected one, and Approve / Reject for an admin.
 * What each person may do is decided by the server and the database; this only decides what to offer.
 */
export function RowActions({
  entry,
  today,
  own,
  admin,
  canChange,
  canFix,
  lockedReason,
}: {
  entry: Entry;
  today: string;
  own: boolean;
  admin: boolean;
  /** Edit and Delete are allowed (an admin always; an employee on their own pending entry inside the 7 days). */
  canChange: boolean;
  /** A rejected entry of your own whose day is still inside the 7 days, so a corrected copy can be sent. */
  canFix: boolean;
  lockedReason: string | null;
}) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [deleting, startDelete] = useTransition();
  const close = () => setDialog(null);

  const draft = {
    id: entry.id,
    date: entry.date,
    start: entry.start,
    end: entry.end,
    project: entry.project,
    text: entry.text,
    noCompOff: entry.noCompOff,
  };
  const copy = { date: today, start: entry.start, end: entry.end, project: entry.project, text: entry.text };
  const label = `${entry.project || "Entry"} on ${formatYmd(entry.date, { day: "numeric", month: "short" })}`;
  const canDuplicate = own; // a copy is always a new entry for today, so even a locked entry can be copied

  function remove() {
    startDelete(async () => {
      const result = admin ? await adminDeleteLogAction(entry.id) : await deleteLogAction(entry.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Time log deleted.");
      close();
    });
  }

  const hasMenu = canChange || canDuplicate;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {admin && !own && entry.status === "pending" && <LazyDecideLogButtons id={entry.id} who={entry.person} />}

      {canFix && (
        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" onClick={() => setDialog("fix")}>
          <RotateCcw aria-hidden="true" /> Fix and resubmit
        </Button>
      )}

      {lockedReason && !admin && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Locked: ${lockedReason}`}
                className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:size-9"
              >
                <Lock className="size-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{lockedReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="max-md:size-11" aria-label={`Actions for ${label}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canChange} onSelect={() => setDialog("edit")}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            {canDuplicate && (
              <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
                <CopyPlus aria-hidden="true" /> Duplicate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!canChange} onSelect={() => setDialog("delete")}>
              <Trash2 aria-hidden="true" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {dialog === "edit" && (
        <Modal
          title={admin && !own ? `Edit ${entry.person}'s entry` : "Edit time log"}
          description="Change the details, then save."
          onClose={close}
        >
          <LazyWorkLogForm today={today} initial={draft} admin={admin ? {} : undefined} onSaved={close} />
        </Modal>
      )}
      {dialog === "duplicate" && (
        <Modal title="Duplicate time log" description="A copy for today. Change anything you like, then add it." onClose={close}>
          <LazyWorkLogForm today={today} prefill={copy} onSaved={close} />
        </Modal>
      )}
      {dialog === "fix" && (
        <Modal
          title="Fix and resubmit"
          description="This entry was rejected. Correct it below and it is sent for approval again as a new entry."
          onClose={close}
        >
          <LazyWorkLogForm today={today} prefill={{ ...copy, date: entry.date }} onSaved={close} />
        </Modal>
      )}

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && !deleting && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this time log?</DialogTitle>
            <DialogDescription>
              {label}
              {entry.start && entry.end ? `, ${clock12(entry.start)} – ${clock12(entry.end)} (${fmtDuration(entry.hours)})` : ""}. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={deleting}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
