import "../dashboard/dashboard.css"; // shared chips, tags, skeleton, buttons
import "./timesheet-page.css";

export default function Loading() {
  return (
    <div className="ts-sheet-page" aria-busy="true">
      <div className="ts-skel" style={{ height: 36, width: 260 }} />
      <section className="ts-card">
        <div className="ts-skel" style={{ height: 220 }} />
        <span className="ts-sr-only" role="status">
          Loading timesheet…
        </span>
      </section>
    </div>
  );
}
