"use client";

import { useState } from "react";
import DeleteLogButton from "../dashboard/DeleteLogButton";
import { LazyWorkLogForm } from "../dashboard/LazyForms";
import { Modal } from "../dashboard/LogDialog";
import type { LogDraft } from "../dashboard/WorkLogForm";

// Admin tools for time logs: change or delete anyone's entry on any date, and add an entry for an employee.

/** Edit and Delete for one entry. Works on any status and any date, including days locked for employees. */
export function AdminRowActions({ entry, ownerName, today }: { entry: LogDraft; ownerName: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="ts-decide">
      <button type="button" className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => setOpen(true)} aria-label={`Edit ${ownerName}'s entry`}>
        Edit
      </button>
      <DeleteLogButton id={entry.id} admin />
      {open && (
        <Modal title={`Edit ${ownerName}'s entry`} onClose={() => setOpen(false)}>
          <LazyWorkLogForm today={today} initial={entry} admin={{}} onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </span>
  );
}

/** Add a time log for an employee on any past date. */
export function AdminAddLog({
  employees,
  today,
  defaultDate,
  defaultEmployeeId,
  label = "Add entry for an employee",
  ghost = false,
}: {
  employees: { id: string; name: string }[];
  today: string;
  defaultDate?: string;
  defaultEmployeeId?: string;
  label?: string;
  ghost?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`ts-btn ts-btn-sm${ghost ? " ts-btn-ghost" : ""}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Modal title="Add a time log for an employee" onClose={() => setOpen(false)}>
          <LazyWorkLogForm
            today={today}
            defaultDate={defaultDate}
            admin={{ employees, employeeId: defaultEmployeeId }}
            onSaved={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
