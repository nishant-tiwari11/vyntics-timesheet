import { Skeleton } from "@/components/ui/skeleton";
import { LoadingEyes } from "@/app/timesheet/_components/LoadingEyes";

export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true" role="status" aria-label="Team, loading">
      <LoadingEyes />
      <div className="grid gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-2 rounded-lg border p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading the team…</span>
    </div>
  );
}
