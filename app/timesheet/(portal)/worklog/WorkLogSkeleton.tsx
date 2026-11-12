import { Skeleton } from "@/components/ui/skeleton";

// Placeholders shaped like the real page, so nothing jumps when the data arrives:
// four summary cards, then the grouped list (a day header and rows, twice).
export function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="grid gap-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {[3, 2].map((rows, g) => (
          <div key={g}>
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-14" />
            </div>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="grid gap-3 border-b px-4 py-3.5 last:border-b-0 max-md:grid-cols-2 md:grid-cols-[1.1fr_1.3fr_.8fr_2.4fr_1fr_1.7fr] md:items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-full max-md:col-span-2" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-8 w-8 justify-self-end" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole page: header, period bar, filters, cards, list. Used while the first load happens. */
export function WorkLogPageSkeleton() {
  return (
    <div className="ts-page ts-dash grid gap-5" aria-busy="true" aria-label="Loading the Work log">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-6 w-36" />
      </div>
      <SummarySkeleton />
      <Skeleton className="h-[116px] w-full" />
      <ListSkeleton />
    </div>
  );
}
