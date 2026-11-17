"use client";

import WeekGrid, { type GridProps } from "./WeekGrid";

/** The Day view: the same grid and row design, with the one selected day as its only hour column. */
export default function DayGrid(props: Omit<GridProps, "days"> & { date: string }) {
  const { date, ...rest } = props;
  return <WeekGrid {...rest} days={[date]} />;
}
