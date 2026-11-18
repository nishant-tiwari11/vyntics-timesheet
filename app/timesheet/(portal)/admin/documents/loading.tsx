import "../../dashboard/dashboard.css";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="ts-page ts-dash grid gap-4" aria-busy="true" aria-label="Loading documents">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <div className="grid gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
