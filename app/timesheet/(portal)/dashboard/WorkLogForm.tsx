"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PROJECTS } from "@/lib/timesheet/projects";
import { EDIT_WINDOW_DAYS, LOCKED_MESSAGE, earliestEditable, isLocked } from "@/lib/timesheet/rules";
import { FormField, Input, Select, Textarea } from "../../_components/Fields";
import { Checkbox } from "@/components/ui/checkbox";
import type { DayInfo } from "@/lib/timesheet/compOff";
import { adminAddLogAction, adminUpdateLogAction } from "../admin/logActions";
import { dayInfoAction } from "../leave/compOffActions";
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

// One form for adding and for editing. `initial` means edit. Hours are worked out from the start and end time.
export default function WorkLogForm({
  today,
  initial,
  defaultDate,
  admin,
  onSaved,
}: {
  today: string;
  initial?: LogDraft;
  /** The date an empty (add) form starts on. Defaults to today. */
  defaultDate?: string;
  /** Admin mode: any past date, and (when adding) a choice of employee. */
  admin?: { employees?: { id: string; name: string }[]; employeeId?: string };
  onSaved?: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? today);
  const [project, setProject] = useState<string>(initial?.project || PROJECTS[0]);
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [noCompOff, setNoCompOff] = useState(initial?.noCompOff ?? false);
  const [employeeId, setEmployeeId] = useState(admin?.employeeId ?? "");
  const [day, setDay] = useState<DayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const isAdminMode = !!admin;

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
    <form onSubmit={onSubmit} noValidate className="ts-form">
      {admin?.employees && !initial && (
        <FormField label="Employee" required error={errors.employee}>
          <Select name="employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={pending}>
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
          <Select name="project" value={project} onChange={(e) => setProject(e.target.value)} disabled={pending}>
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
              setStart(e.target.value);
              clear("start");
            }} disabled={pending} />
        </FormField>
        <FormField label="End time" required error={errors.end}>
          <Input name="end" type="time" value={end} onChange={(e) => {
              setEnd(e.target.value);
              clear("end");
            }} disabled={pending} />
        </FormField>
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

      <button type="submit" className="ts-btn ts-btn-block" disabled={pending}>
        {pending ? "Saving..." : initial ? "Save changes" : "Add time log"}
      </button>
    </form>
  );
}
