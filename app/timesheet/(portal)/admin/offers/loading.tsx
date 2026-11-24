import "../../dashboard/dashboard.css";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingEyes } from "@/app/timesheet/_components/LoadingEyes";

export default function Loading() {
  return (
    <div className="ts-page ts-dash grid gap-4" aria-busy="true" aria-label="Loading offer letters">
      <LoadingEyes />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-xl" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
