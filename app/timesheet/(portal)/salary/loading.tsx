import { Skeleton } from "@/components/ui/skeleton";

// Same shape as the page: title, four summary cards, a payslip, then the chart and the table.
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true" role="status" aria-label="My Salary, loading">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-52 w-full" />
      <span className="sr-only">Loading your salary information…</span>
    </div>
  );
}
