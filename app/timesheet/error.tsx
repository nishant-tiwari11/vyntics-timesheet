"use client";

import "./timesheet.css";

// Shown when something unexpected breaks anywhere in the portal.
// Deliberately shows no technical details: the error is not displayed or logged here.
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="ts-auth">
      <div className="ts-card ts-auth-card" role="alert">
        <h1 className="ts-h1">Something went wrong. Try again.</h1>
        <p className="ts-muted">If it keeps happening, please tell your admin.</p>
        <button type="button" className="ts-btn" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
