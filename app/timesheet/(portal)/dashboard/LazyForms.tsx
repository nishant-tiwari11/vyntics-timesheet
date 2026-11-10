"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import ChunkBoundary from "../../_components/ChunkBoundary";
import { Skeleton } from "../../_components/Skeleton";
import { WorkLogFormSkeleton } from "../../_components/skeletons";
import type DecideLogButtons from "./DecideLogButtons";
import type DeleteLogButton from "./DeleteLogButton";
import type WorkLogForm from "./WorkLogForm";

// The forms inside the pop-ups are only needed once a pop-up opens, so they load on demand.
// Each shows a skeleton of about the same size meanwhile, and a retry message if the code can't be fetched.

const Form = dynamic(() => import("./WorkLogForm"), {
  loading: () => <WorkLogFormSkeleton />,
});
const Delete = dynamic(() => import("./DeleteLogButton"), { loading: () => <Skeleton width={90} height={36} /> });
const Decide = dynamic(() => import("./DecideLogButtons"), { loading: () => <Skeleton width={160} height={36} /> });

export function LazyWorkLogForm(props: ComponentProps<typeof WorkLogForm>) {
  return (
    <ChunkBoundary label="the form">
      <Form {...props} />
    </ChunkBoundary>
  );
}

export function LazyDeleteLogButton(props: ComponentProps<typeof DeleteLogButton>) {
  return (
    <ChunkBoundary label="the button">
      <Delete {...props} />
    </ChunkBoundary>
  );
}

export function LazyDecideLogButtons(props: ComponentProps<typeof DecideLogButtons>) {
  return (
    <ChunkBoundary label="the buttons">
      <Decide {...props} />
    </ChunkBoundary>
  );
}
