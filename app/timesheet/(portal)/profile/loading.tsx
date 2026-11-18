import "../dashboard/dashboard.css";
import { Skeleton } from "@/components/ui/skeleton";

// Shown while the profile loads: the header card, the tab bar, then a few document-shaped rows.
export default function Loading() {
  return (
    <div className="ts-page ts-dash grid max-w-4xl gap-5" aria-busy="true" aria-label="Loading your profile">
      <div className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-5">
          <Skeleton className="size-24 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
