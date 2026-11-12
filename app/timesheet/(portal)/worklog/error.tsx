"use client";

import { Button } from "@/components/ui/button";

// Anything unexpected on this page lands here instead of a blank screen.
export default function WorkLogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="ts-page ts-dash">
      <div className="ts-card ts-empty" role="alert">
        <strong>The Work log couldn&apos;t be shown</strong>
        <p>Something went wrong while building this page. Your entries are safe.</p>
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
