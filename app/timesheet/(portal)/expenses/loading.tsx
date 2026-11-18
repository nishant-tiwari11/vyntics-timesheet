import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" role="status" aria-label="Expenses, loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-2 rounded-lg border p-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading expenses…</span>
    </div>
  );
}
