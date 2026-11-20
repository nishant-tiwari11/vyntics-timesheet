"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatYmd } from "@/lib/timesheet/dates";
import { checkImportAction, runImportAction, type ImportCheck } from "./importActions";

const day = (ymd: string) => (ymd ? formatYmd(ymd, { day: "numeric", month: "short", year: "numeric" }) : "");

// Admin only. Upload an Excel sheet of time logs (the same columns as Export Excel): first "Check file" shows what will be
// added and what is wrong, saving nothing; then "Import" adds the good rows, even for days already locked for employees.
export function ImportButton({ employees, projects }: { employees: { id: string; name: string }[]; projects: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [project, setProject] = useState("");
  const [result, setResult] = useState<ImportCheck | null>(null);

  function reset() {
    setFile(null);
    setResult(null);
    setEmployeeId("");
    setProject("");
    if (input.current) input.current.value = "";
  }

  const form = () => {
    const f = new FormData();
    if (file) f.set("file", file);
    if (employeeId) f.set("employeeId", employeeId);
    if (project) f.set("project", project);
    return f;
  };

  async function check() {
    if (!file) return void toast.error("Choose an Excel file first.");
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkImportAction(form()));
    } catch {
      setResult({ ok: false, error: "Couldn't check the file. Check your connection and try again." });
    }
    setBusy(false);
  }

  async function run() {
    setBusy(true);
    try {
      const res = await runImportAction(form());
      if (!res.ok) {
        toast.error(res.error);
        setResult({ ok: false, error: res.error });
      } else {
        toast.success(`${res.imported} time ${res.imported === 1 ? "log" : "logs"} imported.`);
        setOpen(false);
        reset();
        router.refresh();
      }
    } catch {
      toast.error("Couldn't import. Nothing was saved. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="max-md:min-h-11">
          <Upload aria-hidden="true" /> Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import time logs from Excel</DialogTitle>
          <DialogDescription>
            Add many time logs at once, for any employee and any past day, even weeks that are locked for employees. They are approved straight away.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <p>
            Use the same columns as <strong>Export Excel</strong>: Employee (name or work email), Date, Project, Start, End and Description.{" "}
            <a href="/timesheet/worklog/import-template" className="underline underline-offset-2">
              Download a blank sheet
            </a>
            .
          </p>
          <label className="grid gap-1.5 font-medium">
            Excel file (.xlsx, up to 900 KB, 500 rows)
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="rounded-[var(--radius)] border border-input bg-background px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium max-md:min-h-11"
            />
          </label>

          <fieldset className="grid gap-2 rounded-md border border-dashed p-3" disabled={busy}>
            <legend className="px-1 text-xs font-medium">Is it your own sheet (Date, Day, Work Done, Hours)? It has no Employee or Project column, so choose them here</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Employee
                <select
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setResult(null);
                  }}
                  className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm text-foreground max-md:h-11"
                >
                  <option value="">Use the sheet&apos;s Employee column</option>
                  {employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Project
                <select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setResult(null);
                  }}
                  className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm text-foreground max-md:h-11"
                >
                  <option value="">Use the sheet&apos;s Project column</option>
                  {projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Rows with only Hours are placed from 09:00, one after another on the same day. Day and Work From Home are not used.</p>
          </fieldset>

          <div aria-live="polite" className="grid gap-2">
            {result && !result.ok && (
              <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-destructive">
                {result.error}
              </p>
            )}
            {result?.ok && (
              <div className="grid gap-2 rounded-md border bg-muted/40 p-3">
                <p className="flex items-center gap-2 font-semibold">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  {result.ready} {result.ready === 1 ? "entry is" : "entries are"} ready to import
                  {result.people > 0 && ` for ${result.people} ${result.people === 1 ? "person" : "people"}`}
                </p>
                {result.ready > 0 && (
                  <p className="text-muted-foreground">
                    Days from {day(result.from)} to {day(result.to)}.
                  </p>
                )}
                {result.ignoredColumns.length > 0 && <p className="text-muted-foreground">Columns not used: {result.ignoredColumns.join(", ")}.</p>}
                {result.duplicates > 0 && (
                  <p>
                    {result.duplicates} already {result.duplicates === 1 ? "exists" : "exist"} in the work log (same person, day, time and project) and will be skipped.
                  </p>
                )}
                {result.problemCount > 0 && (
                  <div>
                    <p className="font-medium">
                      {result.problemCount} {result.problemCount === 1 ? "row has" : "rows have"} a problem and will be skipped:
                    </p>
                    <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                      {result.problems.map((p) => (
                        <li key={`${p.row}-${p.message}`}>
                          Row {p.row}: {p.message}
                        </li>
                      ))}
                    </ul>
                    {result.problemCount > result.problems.length && <p className="text-muted-foreground">…and {result.problemCount - result.problems.length} more.</p>}
                  </div>
                )}
                {result.sample.length > 0 && (
                  <div>
                    <p className="font-medium">First rows:</p>
                    <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                      {result.sample.map((r, i) => (
                        <li key={i} className="truncate">
                          {r.person} · {day(r.date)} · {r.project} · {r.start}–{r.end}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {result?.ok && result.ready > 0 ? (
            <Button type="button" disabled={busy} onClick={run}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Import {result.ready} {result.ready === 1 ? "entry" : "entries"}
            </Button>
          ) : (
            <Button type="button" disabled={busy || !file} onClick={check}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Check file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
