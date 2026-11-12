"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PROJECTS } from "@/lib/timesheet/projects";
import { EDIT_WINDOW_DAYS, LOCKED_MESSAGE, earliestEditable, isLocked } from "@/lib/timesheet/rules";
import { FormField, Input, Select, Textarea } from "../../_components/Fields";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DayInfo } from "@/lib/timesheet/compOff";
import { adminAddLogAction, adminUpdateLogAction } from "../admin/logActions";
import { dayInfoAction } from "../leave/compOffActions";
import { dayLogsAction, logHintsAction } from "../worklog/actions";
import { clock12, fmtDuration } from "../worklog/model";
import { useModal } from "./ModalContext";
import { addLogAction, updateLogAction } from "./actions";

const MAX = 500;

type FieldErrors = Partial<Record<"date" | "start" | "end" | "text" | "employee", string>>;

export type LogDraft = {
  id: string;
  date: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  project: string;
  text: string;
  /** Opted out of asking for comp-off for this day. */
  noCompOff?: boolean;
};

/** Starting values for a new entry (Duplicate, or Fix and resubmit). */
export type LogPrefill = Omit<LogDraft, "id">;

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// One form for adding and for editing. `initial` means edit. Hours are worked out from the start and end time.
export default function WorkLogForm({
  today,
  initial,
  prefill,
  defaultDate,
  admin,
  onSaved,
}: {
  today: string;
  initial?: LogDraft;
  /** Fill a NEW entry with these values (it is not an edit). */
  prefill?: LogPrefill;
  /** The date an empty (add) form starts on. Defaults to today. */
  defaultDate?: string;
  /** Admin mode: any past date, and (when adding) a choice of employee. */
  admin?: { employees?: { id: string; name: string }[]; employeeId?: string };
  onSaved?: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const seed = initial ?? prefill;
  // What the form starts with. For a brand-new entry, the last project and usual times arrive a moment later
  // (see below) and become the starting point too, so they don't count as unsaved input.
  const [base, setBase] = useState({
    date: seed?.date ?? defaultDate ?? today,
    project: seed?.project || PROJECTS[0],
    start: seed?.start ?? "",
    end: seed?.end ?? "",
    text: seed?.text ?? "",
    noCompOff: seed?.noCompOff ?? false,
  });
  const [date, setDate] = useState(base.date);
  const [project, setProject] = useState<string>(base.project);
  const [start, setStart] = useState(base.start);
  const [end, setEnd] = useState(base.end);
  const [text, setText] = useState(base.text);
  const [noCompOff, setNoCompOff] = useState(base.noCompOff);
  const [others, setOthers] = useState<{ id: string; start: string; end: string; project: string }[]>([]);
  const touched = useRef(false);
  const [employeeId, setEmployeeId] = useState(admin?.employeeId ?? "");
  const [day, setDay] = useState<DayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const isAdminMode = !!admin;
  const modal = useModal();

  // Tell the window whether there is unsaved input, so closing it can ask first.
  const dirty =
    date !== base.date ||
    project !== base.project ||
    start !== base.start ||
    end !== base.end ||
    text !== base.text ||
    noCompOff !== base.noCompOff;
  const setDirty = modal?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
  }, [dirty, setDirty]);

  // Smart defaults: a new entry starts with the project you used last and your usual start and end time.
  const wantsHints = !initial && !prefill && !isAdminMode;
  useEffect(() => {
    if (!wantsHints) return;
    let live = true;
    logHintsAction().then((res) => {
      if (!live || !res.ok || touched.current) return;
      const { project: p, start: s, end: e } = res.hints;
      setBase((b) => ({ ...b, project: p ?? b.project, start: s ?? b.start, end: e && s && e > s ? e : b.end }));
      if (p) setProject(p);
      if (s) setStart(s);
      if (e && s && e > s) setEnd(e);
    });
    return () => {
      live = false;
    };
  }, [wantsHints]);

  // Your other entries on the chosen day, to warn when the times overlap.
  useEffect(() => {
    let live = true;
    if (!date || isAdminMode) return;
    dayLogsAction(date).then((res) => {
      if (live) setOthers(res.ok ? res.entries : []);
    });
    return () => {
      live = false;
    };
  }, [date, isAdminMode]);

  // Is the chosen day a week off or a holiday, and is there already a comp-off request for it?
  useEffect(() => {
    let live = true;
    if (!date || isAdminMode) return; // the notice is about your own comp-off
    dayInfoAction(date).then((res) => {
      if (live) setDay(res.ok ? res.info : null);
    });
    return () => {
      live = false;
    };
  }, [date, isAdminMode]);

  const empty = text.trim().length === 0;
  const timesReady = !!start && !!end;
  const endBeforeStart = timesReady && end <= start;
  const minutes = timesReady && !endBeforeStart ? minutesOf(end) - minutesOf(start) : null;
  const overlaps =
    timesReady && !endBeforeStart
      ? others.filter((o) => o.id !== initial?.id && start < o.end && end > o.start)
      : [];
  const clear = (k: keyof FieldErrors) => setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));

  // Each message sits under the box it is about; the first box with a problem gets the focus.
  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!date) found.date = "Choose the date you worked.";
    else if (date > today) found.date = "You can't add a log for a future date.";
    else if (!admin && isLocked(date, today)) found.date = LOCKED_MESSAGE;
    if (admin && !initial && !employeeId) found.employee = "Choose the employee.";
    if (!start) found.start = "Enter a start time.";
    if (!end) found.end = "Enter an end time.";
    else if (start && end <= start) found.end = "The end time must be after the start time.";
    if (empty) found.text = "Write a line or two about what you worked on.";
    return found;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const found = validate();
    setErrors(found);
    const first = (["employee", "date", "start", "end", "text"] as const).find((k) => found[k]);
    if (first) {
      e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    const input = admin ? { date, text, start, end, project } : { date, text, start, end, project, noCompOff };
    startTransition(async () => {
      const result = admin
        ? initial
          ? await adminUpdateLogAction(initial.id, input)
          : await adminAddLogAction(employeeId, input)
        : initial
          ? await updateLogAction(initial.id, input)
          : await addLogAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return setError(result.error);
      }
      toast.success(initial ? "Time log saved." : "Time log added.");
      // On a week off or holiday the database may have created, changed or cancelled a comp-off request.
      if (!admin && day?.isOff) {
        const after = await dayInfoAction(date);
        if (after.ok) {
          const r = after.info.request;
          if (r?.needsReapproval) toast.info("Comp-off changed. Your admin must approve the new amount.");
          else if (r && !day.request) toast.info(`Comp-off request created (${r.status === "pending" ? "Pending" : r.status})`);
          else if (r && day.request) toast.info(`Comp-off request updated (${r.status === "pending" ? "Pending" : r.status})`);
          else if (!r && day.request) toast.info("Comp-off request cancelled.");
        }
      }
      if (onSaved) return onSaved();
      setText("");
      setStart("");
      setEnd("");
      setSuccess(true);
      textRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        // Enter inside a single-line box must not save by accident; the Add time log button saves.
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      noValidate
      className="ts-form"
    >
      {admin?.employees && !initial && (
        <FormField label="Employee" required error={errors.employee}>
          <Select name="employee" autoFocus value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={pending}>
            <option value="">Choose an employee</option>
            {admin.employees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <div className="ts-row-2">
        <FormField label="Date" required error={errors.date} hint={admin ? "As an admin you can use any past date." : `You can add or change a day for ${EDIT_WINDOW_DAYS} days, then it locks.`}>
          <Input
            name="date"
            type="date"
            autoFocus={!(admin?.employees && !initial)}
            value={date}
            min={admin ? undefined : earliestEditable(today)}
            max={today}
            onChange={(e) => {
              setDate(e.target.value);
              clear("date");
            }}
            disabled={pending}
          />
        </FormField>
        <FormField label="Project">
          <Select name="project" value={project} onChange={(e) => {
              touched.current = true;
              setProject(e.target.value);
            }} disabled={pending}>
            {PROJECTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="ts-row-2">
        <FormField label="Start time" required error={errors.start}>
          <Input name="start" type="time" value={start} onChange={(e) => {
              touched.current = true;
              setStart(e.target.value);
              clear("start");
            }} disabled={pending} />
        </FormField>
        <FormField label="End time" required error={errors.end ?? (endBeforeStart ? "The end time must be after the start time." : undefined)}>
          <Input name="end" type="time" value={end} onChange={(e) => {
              touched.current = true;
              setEnd(e.target.value);
              clear("end");
            }} disabled={pending} />
        </FormField>
      </div>

      <div aria-live="polite" className="grid gap-1.5 text-sm">
        {minutes !== null && (
          <p>
            <span className="text-muted-foreground">Duration: </span>
            <strong>{fmtDuration(minutes / 60)}</strong>
          </p>
        )}
        {overlaps.length > 0 && (
          <p role="note" className="rounded-md border border-dashed px-3 py-2">
            <strong>Overlaps another entry.</strong> You already have{" "}
            {overlaps.map((o) => `${clock12(o.start)} – ${clock12(o.end)}${o.project ? ` (${o.project})` : ""}`).join(" and ")} that day. You can still save.
          </p>
        )}
      </div>

      <FormField
        label="What did you work on?"
        required
        error={errors.text}
        hint={
          <span aria-label={`${text.length} of ${MAX} characters`} style={{ display: "block", textAlign: "right" }}>
            {text.length}/{MAX}
          </span>
        }
      >
        <Textarea
          name="text"
          ref={textRef}
          rows={4}
          maxLength={MAX}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            clear("text");
          }}
          disabled={pending}
          placeholder="e.g. Fixed the invoice export bug and reviewed two pull requests"
        />
      </FormField>

      {!admin && day?.isOff && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3 text-sm" role="note">
          <p>
            <span className="mr-1.5 inline-flex rounded border border-foreground px-1.5 text-xs font-medium">{day.label}</span>
            You can log hours today. They are optional, and a day of work earns comp-off.
          </p>
          {day.request && (
            <p className="text-muted-foreground">
              Comp-off request:{" "}
              <strong className="text-foreground">
                {day.request.needsReapproval ? "Approved, change waiting for re-approval" : day.request.status === "pending" ? "Pending" : day.request.status === "approved" ? "Approved" : "Rejected"}
              </strong>{" "}
              ({day.request.credit === 1 ? "1 day" : "½ day"}, {day.request.hours} h)
            </p>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="log-no-comp-off" checked={noCompOff} onCheckedChange={(v) => setNoCompOff(v === true)} disabled={pending} />
            <label htmlFor="log-no-comp-off" className="cursor-pointer">
              Don&apos;t request comp-off for this day
            </label>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {error && (
          <p className="ts-alert" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="ts-success" role="status">
            Time log added.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => modal?.requestClose()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? "Saving..." : initial ? "Save changes" : "Add time log"}
        </Button>
      </div>
    </form>
  );
}
