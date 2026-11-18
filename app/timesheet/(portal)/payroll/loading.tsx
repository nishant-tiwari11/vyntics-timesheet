import { Skeleton } from "@/components/ui/skeleton";

// Shown while any Payroll page loads (the heading and tabs above it stay on screen; only this part is replaced).
export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Payroll, loading">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-2 rounded-lg border p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading payroll…</span>
    </div>
  );
}
