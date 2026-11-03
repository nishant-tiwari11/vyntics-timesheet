"use client";

export default function TimesheetError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="ts-card">
      <p className="ts-alert" role="alert">
        The timesheet couldn&apos;t be shown. Please try again.
      </p>
      <button type="button" className="ts-btn ts-btn-sm" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
