"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Load the page's data again without a full reload. */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="outline" className="max-md:min-h-11" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
      {pending ? "Loading..." : label}
    </Button>
  );
}
