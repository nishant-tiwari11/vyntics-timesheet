"use client";

import dynamic from "next/dynamic";
import ChunkBoundary from "../../_components/ChunkBoundary";
import { Skeleton } from "@/components/ui/skeleton";

// The chart loads only when this page is opened, with a skeleton of the same height meanwhile (no layout shift).
const Chart = dynamic(() => import("./NetPayChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-52 w-full" aria-label="Loading chart" />,
});

export default function LazyNetPayChart(props: React.ComponentProps<typeof Chart>) {
  return (
    <ChunkBoundary label="the chart">
      <Chart {...props} />
    </ChunkBoundary>
  );
}
