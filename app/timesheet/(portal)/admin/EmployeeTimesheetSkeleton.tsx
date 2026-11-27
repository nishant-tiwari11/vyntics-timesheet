import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "../worklog/WorkLogSkeleton";

// What shows under the orb the moment an employee's card is clicked, until their timesheet arrives from the server: the same shape
// (title, Day / Week switch, date bar, entries) so nothing jumps when the real one takes its place, and a line saying what is coming.
export function EmployeeTimesheetSkeleton({ name }: { name: string }) {
  return (
    <section role="status" aria-live="polite" aria-busy="true" aria-label={`Loading ${name}'s timesheet`} className="ts-page ts-dash grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="ts-h2">{name}&apos;s timesheet</h2>
          <p className="ts-muted inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60 motion-reduce:animate-none" />
            Loading {name}&apos;s timesheet…
          </p>
        </div>
        <Skeleton className="h-9 w-32 rounded-[var(--radius)]" />
      </div>
      <Skeleton className="h-10 w-64 rounded-[var(--radius)]" />
      <div className="ts-card grid gap-4" aria-hidden="true">
        <div className="grid gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <ListSkeleton />
      </div>
    </section>
  );
}
