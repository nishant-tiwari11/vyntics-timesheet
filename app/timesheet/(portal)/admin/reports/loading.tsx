import { Skeleton } from "@/components/ui/skeleton";
import { LoadingEyes } from "@/app/timesheet/_components/LoadingEyes";

export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Reports, loading">
      <LoadingEyes />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-px overflow-hidden rounded-xl border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
