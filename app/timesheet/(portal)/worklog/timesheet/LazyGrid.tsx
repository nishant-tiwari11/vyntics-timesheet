"use client";

import dynamic from "next/dynamic";
import ChunkBoundary from "../../../_components/ChunkBoundary";
import { GridSkeleton } from "./GridSkeleton";
import type { GridProps } from "./WeekGrid";

// The Day and Week grids load on demand, each with a skeleton of about its own size in the meantime, and a
// retry message if the code can't be fetched.
const Week = dynamic(() => import("./WeekGrid"), { loading: () => <GridSkeleton days={7} /> });
const Day = dynamic(() => import("./DayGrid"), { loading: () => <GridSkeleton days={1} /> });

export function LazyGrid({ view, ...props }: Omit<GridProps, "days"> & { view: "day" | "week"; days: string[] }) {
  return (
    <ChunkBoundary label="the timesheet">
      {view === "day" ? <Day date={props.days[0]} entries={props.entries} myId={props.myId} today={props.today} projects={props.projects} /> : <Week {...props} />}
    </ChunkBoundary>
  );
}
