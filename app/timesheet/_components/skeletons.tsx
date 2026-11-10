import { Skeleton, SkeletonRegion } from "./Skeleton";

// Page-specific skeletons. They reuse the real layout classes (grids, cards, tables) with the same row and
// cell sizes, so the page doesn't jump when the real content replaces them.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// A field label is 20px tall (see fields.css), so skeleton labels are too.
const SkeletonLabel = ({ width = 80 }: { width?: number }) => <Skeleton width={width} height={20} />;

/** The time log form, with the same rows and box sizes as the real one. */
export function WorkLogFormSkeleton() {
  return (
    <SkeletonRegion label="Time log form">
      <div className="ts-form" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className="ts-row-2">
            {[0, 1].map((col) => (
              <div key={col} className="ts-field">
                <SkeletonLabel width={row === 0 && col === 1 ? 64 : 84} />
                <Skeleton height={42} />
              </div>
            ))}
          </div>
        ))}
        <div className="ts-field">
          <SkeletonLabel width={170} />
          <Skeleton height={115} />
          <Skeleton width={44} height={18} style={{ marginLeft: "auto" }} />
        </div>
        <Skeleton height={44} />
      </div>
    </SkeletonRegion>
  );
}

// ---------------------------- Dashboard ----------------------------

export function StatsSkeleton() {
  return (
    <SkeletonRegion label="This week">
      <ul className="ts-stats" aria-hidden="true">
        {["a", "b", "c", "d"].map((tone) => (
          <li key={tone} className={`ts-stat ts-stat-${tone}`}>
            <Skeleton width={42} height={42} radius={10} style={{ gridArea: "icon" }} />
            <Skeleton width="55%" height={24} style={{ gridArea: "value", margin: "3px 0" }} />
            <Skeleton width="80%" height={14} style={{ gridArea: "label", margin: "3px 0" }} />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

export function SnapshotSkeleton() {
  return (
    <SkeletonRegion label="Today's snapshot">
      <ul className="ts-snap-row" aria-hidden="true">
        {range(4).map((i) => (
          <li key={i} className="ts-snap">
            <Skeleton width="70%" height={18} />
            <Skeleton width={64} height={22} pill />
            <Skeleton height={8} pill />
          </li>
        ))}
      </ul>
    </SkeletonRegion>
  );
}

/** The dashboard calendar card: header, filters, a month grid and the legend. */
export function CalendarCardSkeleton() {
  return (
    <SkeletonRegion label="Calendar">
      <div className="ts-card ts-lc" aria-hidden="true">
        <div className="ts-lc-head">
          <div className="ts-lc-title">
            <Skeleton width={150} height={28} />
            <Skeleton width={120} height={30} />
          </div>
          <Skeleton width={230} height={34} />
        </div>
        <div className="ts-lc-filters">
          <Skeleton height={36} style={{ flex: "1 1 220px" }} />
          <Skeleton width={130} height={36} />
          <Skeleton width={130} height={36} />
        </div>
        <div className="ts-lc-month">
          {range(7).map((i) => (
            <div key={i} className="ts-lc-wd">
              <Skeleton width={28} height={14} style={{ margin: "0 auto" }} />
            </div>
          ))}
          {range(42).map((i) => (
            <div key={i} className="ts-lc-cell">
              <Skeleton width={24} height={24} circle />
              {i % 5 === 1 && <Skeleton height={18} />}
              {i % 7 === 3 && <Skeleton height={18} />}
            </div>
          ))}
        </div>
        <Skeleton width="60%" height={18} />
      </div>
    </SkeletonRegion>
  );
}

/** The time logs section: title and filters, then a table with header, rows and the pager. */
export function TimeLogsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Time logs">
      <section className="ts-section" aria-hidden="true">
        <div className="ts-section-head">
          <Skeleton width={200} height={26} />
          <Skeleton width={320} height={34} />
        </div>
        <div className="ts-card ts-flush" style={{ marginTop: 12 }}>
          <div className="ts-table-wrap">
            <table className="ts-table ts-logs-table ts-sk-table">
              <thead>
                <tr>
                  {range(8).map((i) => (
                    <th key={i} scope="col">
                      <Skeleton width={i === 5 ? 80 : 56} height={12} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {range(rows).map((r) => (
                  <tr key={r}>
                    {range(8).map((c) => (
                      <td key={c}>
                        <Skeleton width={c === 5 ? "90%" : c === 6 ? 70 : 64} height={c === 6 ? 22 : 16} pill={c === 6} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ts-pager">
            <Skeleton width={180} height={30} />
            <Skeleton width={200} height={30} />
          </div>
        </div>
      </section>
    </SkeletonRegion>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="ts-page ts-dash" aria-busy="true">
      <header className="ts-dash-head" aria-hidden="true">
        <div>
          <Skeleton width={320} height={34} />
          <Skeleton width={180} height={16} style={{ marginTop: 8 }} />
        </div>
        <Skeleton width={140} height={40} />
      </header>
      <StatsSkeleton />
      <CalendarCardSkeleton />
      <TimeLogsSkeleton />
    </div>
  );
}

// ---------------------------- Leave & WFH ----------------------------

/** The apply form: type cards, dates, reason and the send button. */
export function ApplyFormSkeleton() {
  return (
    <SkeletonRegion label="Apply for leave or WFH">
      <section className="ts-card" aria-hidden="true">
        <h2 className="ts-h2">Apply for leave or WFH</h2>
        <div className="ts-apply">
          <div className="ts-apply-types">
            <Skeleton height={64} radius={10} />
            <Skeleton height={64} radius={10} />
          </div>
          <div className="ts-apply-dates">
            {[0, 1].map((i) => (
              <div key={i} className="ts-field">
                <SkeletonLabel />
                <Skeleton height={42} />
              </div>
            ))}
            <Skeleton width={130} height={26} pill style={{ gridColumn: "1 / -1" }} />
          </div>
          <div className="ts-field">
            <SkeletonLabel width={110} />
            <Skeleton height={92} />
            <Skeleton width={36} height={18} style={{ marginLeft: "auto" }} />
          </div>
          <div className="ts-apply-actions">
            <Skeleton width={130} height={40} />
          </div>
        </div>
      </section>
    </SkeletonRegion>
  );
}

/** A table of requests: header and a few rows. */
export function RequestsSkeleton({ title = "Your requests", rows = 3 }: { title?: string; rows?: number }) {
  return (
    <SkeletonRegion label={title}>
      <section className="ts-card" aria-hidden="true">
        <h2 className="ts-h2">{title}</h2>
        <div className="ts-table-wrap">
          <table className="ts-table ts-sk-table">
            <thead>
              <tr>
                {range(5).map((i) => (
                  <th key={i} scope="col">
                    <Skeleton width={56} height={12} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {range(rows).map((r) => (
                <tr key={r}>
                  <td>
                    <Skeleton width={90} height={16} />
                  </td>
                  <td>
                    <Skeleton width={170} height={16} />
                  </td>
                  <td>
                    <Skeleton width="85%" height={16} />
                  </td>
                  <td>
                    <Skeleton width={76} height={22} pill />
                  </td>
                  <td>
                    <Skeleton width={64} height={30} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SkeletonRegion>
  );
}

export function LeaveSkeleton() {
  return (
    <div className="ts-page" aria-busy="true">
      <header aria-hidden="true">
        <Skeleton width={220} height={34} />
        <Skeleton width="min(520px, 100%)" height={16} style={{ marginTop: 8 }} />
      </header>
      <ApplyFormSkeleton />
      <RequestsSkeleton />
    </div>
  );
}

// ---------------------------- Admin ----------------------------

/** A data table with a header row and body rows, used for every admin tab. */
export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Admin table">
      <section className="ts-card ts-flush" aria-hidden="true">
        <div className="ts-table-wrap">
          <table className="ts-table ts-sk-table">
            <thead>
              <tr>
                {range(5).map((i) => (
                  <th key={i} scope="col">
                    <Skeleton width={64} height={12} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {range(rows).map((r) => (
                <tr key={r}>
                  <td>
                    <Skeleton width={150} height={16} />
                    <Skeleton width={110} height={12} style={{ marginTop: 6 }} />
                  </td>
                  <td>
                    <Skeleton width={90} height={16} />
                  </td>
                  <td>
                    <Skeleton width={170} height={16} />
                  </td>
                  <td>
                    <Skeleton width={76} height={22} pill />
                  </td>
                  <td>
                    <Skeleton width={120} height={32} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SkeletonRegion>
  );
}

export function AdminSkeleton() {
  return (
    <div className="ts-page" aria-busy="true">
      <Skeleton width={110} height={34} />
      <div className="ts-admin-tabs" aria-hidden="true">
        {range(4).map((i) => (
          <span key={i} className="ts-admin-tab">
            <Skeleton width={72} height={16} />
          </span>
        ))}
      </div>
      <AdminTableSkeleton />
    </div>
  );
}

// ---------------------------- Calendar page ----------------------------

/** The full-page month calendar: heading, month navigation and a 6-week grid. */
export function MonthPageSkeleton() {
  return (
    <div className="ts-page" aria-busy="true">
      <header className="ts-page-head" aria-hidden="true">
        <Skeleton width={220} height={34} />
        <Skeleton width={260} height={36} />
      </header>
      <SkeletonRegion label="Calendar">
        <section className="ts-card ts-cal-card" aria-hidden="true">
          <div className="ts-cal-weekdays">
            {range(7).map((i) => (
              <span key={i}>
                <Skeleton width={28} height={14} style={{ margin: "0 auto" }} />
              </span>
            ))}
          </div>
          <ol className="ts-cal-grid">
            {range(42).map((i) => (
              <li key={i} className="ts-cal-cell">
                <div className="ts-cal-day">
                  <span className="ts-cal-top">
                    <Skeleton width={20} height={16} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </SkeletonRegion>
    </div>
  );
}
