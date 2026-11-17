"use client";

import { toast } from "sonner";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Recurring entries don't exist yet, so this is only the button and a count of 0.
export function RecurringButton({ count = 0 }: { count?: number }) {
  return (
    <Button type="button" variant="outline" className="max-md:min-h-11" onClick={() => toast.info("Recurring entries aren't available yet.")}>
      <Repeat aria-hidden="true" /> Recurring
      <Badge variant="secondary" className="rounded-full px-1.5">
        {count}
      </Badge>
    </Button>
  );
}
