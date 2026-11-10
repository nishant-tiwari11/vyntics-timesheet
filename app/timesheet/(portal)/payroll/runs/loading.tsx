import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Payroll runs, loading">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-2 rounded-lg border p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading payroll runs…</span>
    </div>
  );
}
