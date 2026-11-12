"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatYmd } from "@/lib/timesheet/dates";
import { copyDayAction, logHintsAction } from "./actions";

type Source = { date: string; count: number; todayCount: number };

// "Copy yesterday's entries": finds your latest earlier day (within the 7-day window), asks first, then adds the
// same entries to today as new pending entries.
export function CopyYesterdayButton({ today }: { today: string }) {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [looking, startLook] = useTransition();
  const [copying, startCopy] = useTransition();

  function look() {
    startLook(async () => {
      const res = await logHintsAction();
      if (!res.ok) return void toast.error(res.error);
      if (!res.hints.previousDay) return void toast.info("No earlier entries in the last 7 days to copy.");
      setSource({ ...res.hints.previousDay, todayCount: res.hints.todayCount });
    });
  }

  function copy() {
    if (!source) return;
    startCopy(async () => {
      const res = await copyDayAction(source.date);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Copied ${res.count} ${res.count === 1 ? "entry" : "entries"} to today.`);
      setSource(null);
      router.refresh();
    });
  }

  const label = source ? formatYmd(source.date, { weekday: "long", day: "numeric", month: "short" }) : "";

  return (
    <>
      <Button type="button" variant="outline" className="max-md:min-h-11" onClick={look} disabled={looking}>
        {looking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CopyPlus aria-hidden="true" />}
        Copy yesterday&apos;s entries
      </Button>
      <Dialog open={!!source} onOpenChange={(open) => !open && !copying && setSource(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Copy {source?.count === 1 ? "1 entry" : `${source?.count} entries`} to today?</DialogTitle>
            <DialogDescription>
              From {label} to {formatYmd(today, { weekday: "long", day: "numeric", month: "short" })}. They are added as new pending
              entries, and you can edit them afterwards.
              {source && source.todayCount > 0 && ` You already have ${source.todayCount} ${source.todayCount === 1 ? "entry" : "entries"} today; these are added alongside.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSource(null)} disabled={copying}>
              Cancel
            </Button>
            <Button type="button" onClick={copy} disabled={copying}>
              {copying && <Loader2 className="animate-spin" aria-hidden="true" />}
              {copying ? "Copying..." : "Copy entries"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
