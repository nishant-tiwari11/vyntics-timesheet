"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The badge rail and its physics are a big piece of code. It is fetched after the rest of the overview is on screen, with a
// plain placeholder of the same size in its place, so the numbers and the approvals list appear without waiting for it.
export const EmployeeRailLazy = dynamic(() => import("./EmployeeRail").then((m) => m.EmployeeRail), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-xl" />,
});
