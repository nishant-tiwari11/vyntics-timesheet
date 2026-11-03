"use client";

import Link from "next/link";

// Plain links, so the browser's back button and "open in new tab" work.
export default function CalendarNav({
  prevHref,
  todayHref,
  nextHref,
  isCurrentMonth,
  prevLabel,
  nextLabel,
}: {
  prevHref: string;
  todayHref: string;
  nextHref: string;
  isCurrentMonth: boolean;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <nav className="ts-week-nav" aria-label="Choose month">
      <Link href={prevHref} className="ts-btn ts-btn-ghost ts-btn-sm" aria-label={`Previous month, ${prevLabel}`}>
        <span aria-hidden="true">←</span> Previous
      </Link>
      <Link
        href={todayHref}
        className="ts-btn ts-btn-ghost ts-btn-sm"
        aria-current={isCurrentMonth ? "page" : undefined}
      >
        Today
      </Link>
      <Link href={nextHref} className="ts-btn ts-btn-ghost ts-btn-sm" aria-label={`Next month, ${nextLabel}`}>
        Next <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
