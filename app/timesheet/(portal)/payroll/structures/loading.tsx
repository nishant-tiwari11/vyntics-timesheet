import { Skeleton } from "@/components/ui/skeleton";

// Same shape as the real page (a note, then a table of employees), so nothing jumps when it loads.
export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Salary structures, loading">
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="grid gap-2 rounded-lg border p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading salary structures…</span>
    </div>
  );
}
