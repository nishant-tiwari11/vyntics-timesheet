"use client";

import dynamic from "next/dynamic";
import ChunkBoundary from "../_components/ChunkBoundary";

// The animation is decoration only, so the sign-in form doesn't wait for it. It is positioned over the
// hero's black background, so nothing moves when it appears, and if it can't load nothing is shown.
const HeroAnimation = dynamic(() => import("./HeroAnimation"), { ssr: false });

export default function HeroAnimationLazy() {
  return (
    <ChunkBoundary silent>
      <HeroAnimation />
    </ChunkBoundary>
  );
}
