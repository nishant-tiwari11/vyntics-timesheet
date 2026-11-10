import { Skeleton } from "@/components/ui/skeleton";

// Same shape as the real page: sidebar, toolbar and a 6-week grid, so nothing jumps when it loads.
export default function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]" aria-busy="true" role="status" aria-label="Events, loading">
      <div className="hidden gap-6 lg:grid">
        <Skeleton className="h-60 w-full" />
        <div className="grid gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="ml-auto h-9 w-52" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="ml-auto h-9 w-36" />
        </div>
        <Skeleton className="h-[34rem] w-full" />
      </div>
      <span className="sr-only">Loading events…</span>
    </div>
  );
}
