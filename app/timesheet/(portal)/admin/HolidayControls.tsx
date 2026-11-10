"use client";

import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HOLIDAY_TYPES, type Holiday, type HolidayType } from "@/lib/timesheet/holidayTypes";
import type { ImportResult } from "@/lib/timesheet/holidays";
import {
  createHolidayAction,
  deleteHolidayAction,
  importHolidaysAction,
  markYearReviewedAction,
  updateHolidayAction,
} from "./holidayActions";

type Errors = Partial<Record<"name" | "date", string>>;

// ---------------------------- Add / edit ----------------------------

function HolidayForm({ holiday, defaultYear, onClose }: { holiday?: Holiday; defaultYear: number; onClose: () => void }) {
  const [name, setName] = useState(holiday?.name ?? "");
  const [date, setDate] = useState(holiday?.date ?? `${defaultYear}-01-01`);
  const [type, setType] = useState<HolidayType>(holiday?.type ?? "public");
  const [description, setDescription] = useState(holiday?.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: Errors = {};
    if (!name.trim()) found.name = "Enter the holiday's name.";
    if (!date) found.date = "Choose the date.";
    setErrors(found);
    if (found.name || found.date) return;

    startTransition(async () => {
      const input = { name, date, type, description };
      const res = holiday ? await updateHolidayAction(holiday.id, input) : await createHolidayAction(input);
      if (!res.ok) {
        setFormError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(holiday ? "Holiday saved." : "Holiday added.");
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{holiday ? "Edit holiday" : "Add holiday"}</DialogTitle>
        <DialogDescription>Saving marks the date as checked.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="hol-name">
          Name <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="hol-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "hol-name-error" : undefined}
          disabled={pending}
        />
        {errors.name && (
          <p id="hol-name-error" role="alert" className="text-sm font-medium text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="hol-date">
            Date <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="hol-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? "hol-date-error" : undefined}
            disabled={pending}
          />
          {errors.date && (
            <p id="hol-date-error" role="alert" className="text-sm font-medium text-destructive">
              {errors.date}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hol-type">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as HolidayType)} disabled={pending}>
            <SelectTrigger id="hol-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOLIDAY_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">{HOLIDAY_TYPES.find((t) => t.id === type)?.hint}.</p>

      <div className="grid gap-1.5">
        <Label htmlFor="hol-desc">Description (optional)</Label>
        <Textarea id="hol-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} disabled={pending} />
      </div>

      {formError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : holiday ? "Save changes" : "Add holiday"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddHolidayButton({ defaultYear }: { defaultYear: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> Add holiday
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <HolidayForm defaultYear={defaultYear} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------- Row actions ----------------------------

export function HolidayActions({ holiday }: { holiday: Holiday }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteHolidayAction(holiday.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Holiday deleted.");
      setDeleting(false);
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${holiday.name}`}>
        <Pencil aria-hidden="true" /> <span className="hidden sm:inline">Edit</span>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(true)} aria-label={`Delete ${holiday.name}`}>
        <Trash2 aria-hidden="true" /> <span className="hidden sm:inline">Delete</span>
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>{editing && <HolidayForm holiday={holiday} defaultYear={holiday.year} onClose={() => setEditing(false)} />}</DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {holiday.name}?</DialogTitle>
            <DialogDescription>
              It will disappear from every calendar, and that day counts as a normal working day again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(false)} disabled={pending}>
              Keep
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Deleting..." : "Delete holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------- Mark reviewed ----------------------------

export function MarkReviewedButton({ year, count }: { year: number; count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markYearReviewedAction(year);
          if (res.ok) toast.success(res.message ?? "Marked as reviewed.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? "Saving..." : `Mark all ${count} as reviewed`}
    </Button>
  );
}

// ---------------------------- CSV import ----------------------------

const SAMPLE = "date,name,type,description\n2027-01-26,Republic Day,public,National holiday\n2027-03-22,Holi,public,";

export function ImportHolidays() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setText("");
    setResult(null);
    setError(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) return setError("That file is too large. Keep it under 200 KB.");
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function submit() {
    setError(null);
    setResult(null);
    if (!text.trim()) return setError("Choose a CSV file or paste the rows first.");
    startTransition(async () => {
      const res = await importHolidaysAction(text);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setResult(res.import ?? { added: 0, skipped: [] });
      if (res.import && res.import.added > 0) toast.success(`${res.import.added} holidays imported.`);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Upload aria-hidden="true" /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import holidays from CSV</DialogTitle>
            <DialogDescription>
              Columns: date, name, type (public, optional or festival), description. Dates look like 2027-01-26 or 26/01/2027. A date that already has a holiday is skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="hol-file">CSV file</Label>
            <Input id="hol-file" type="file" accept=".csv,text/csv" onChange={onFile} disabled={pending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hol-csv">Or paste the rows</Label>
            <Textarea id="hol-csv" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={SAMPLE} className="font-mono text-xs" disabled={pending} />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <Alert role="status">
              <AlertTitle>
                {result.added} added{result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}
              </AlertTitle>
              {result.skipped.length > 0 && (
                <AlertDescription>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4">
                    {result.skipped.map((s) => (
                      <li key={s.line}>
                        Line {s.line}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              {result ? "Done" : "Cancel"}
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
