import { Skeleton } from "@/components/ui/skeleton";
import { gridColumns } from "./gridModel";

/** Placeholder shaped like the grid (day headers, three rows, totals), so nothing jumps when the real one arrives. */
export function GridSkeleton({ days = 7 }: { days?: number }) {
  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading timesheet">
      <div className="grid w-max min-w-full gap-px" aria-hidden="true">
        <div className="grid items-end gap-2 border-l-4 border-transparent pb-2" style={{ gridTemplateColumns: gridColumns(days) }}>
          <span />
          <span />
          {Array.from({ length: days }, (_, i) => (
            <Skeleton key={i} className="ml-auto h-8 w-12" />
          ))}
          <Skeleton className="ml-auto h-4 w-10" />
          <span />
        </div>
        {[0, 1, 2].map((r) => (
          <div key={r} className="grid items-center gap-2 border-l-4 border-orange-600/30 bg-muted py-3" style={{ gridTemplateColumns: gridColumns(days) }}>
            <div className="grid gap-1.5 px-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="mx-auto size-8" />
            {Array.from({ length: days }, (_, i) => (
              <Skeleton key={i} className="mx-0.5 h-9" />
            ))}
            <Skeleton className="ml-auto h-4 w-12" />
            <Skeleton className="mx-auto size-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
