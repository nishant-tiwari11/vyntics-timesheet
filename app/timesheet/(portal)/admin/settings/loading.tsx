import { Skeleton } from "@/components/ui/skeleton";
import { LoadingEyes } from "@/app/timesheet/_components/LoadingEyes";

export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Settings, loading">
      <LoadingEyes />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-60 w-full rounded-xl" />
    </div>
  );
}
