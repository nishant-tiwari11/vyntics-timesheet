import { Skeleton } from "@/components/ui/skeleton";
import { LoadingEyes } from "@/app/timesheet/_components/LoadingEyes";

export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Expenses, loading">
      <LoadingEyes />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-full max-w-lg" />
      <div className="grid gap-2 rounded-lg border p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading expenses…</span>
    </div>
  );
}
