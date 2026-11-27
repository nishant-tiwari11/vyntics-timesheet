import { Skeleton } from "../../_components/Skeleton";

export default function Loading() {
  return (
    <div className="grid gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading tickets</span>
      <Skeleton width={180} height={32} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
      <Skeleton height={40} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={52} />
      ))}
    </div>
  );
}
