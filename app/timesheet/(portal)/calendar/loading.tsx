import "../dashboard/dashboard.css";
import "../timesheet/timesheet-page.css";
import "./calendar.css";

export default function Loading() {
  return (
    <div className="ts-sheet-page" aria-busy="true">
      <div className="ts-skel" style={{ height: 36, width: 220 }} />
      <section className="ts-card">
        <div className="ts-skel" style={{ height: 360 }} />
        <span className="ts-sr-only" role="status">
          Loading calendar…
        </span>
      </section>
    </div>
  );
}
