import { Skeleton } from "@/components/ui/skeleton";

// Same shape as the real page: a note, the rules form, the components table and the activity log.
export default function Loading() {
  return (
    <div className="grid gap-8" aria-busy="true" role="status" aria-label="Payroll settings, loading">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-52 w-full" />
      </div>
      <span className="sr-only">Loading payroll settings…</span>
    </div>
  );
}
