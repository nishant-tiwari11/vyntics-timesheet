"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { waiting, type AttentionItem } from "@/lib/admin/overviewModel";
import { UserAvatar } from "../../_components/UserAvatar";
import { decideLogAction } from "../dashboard/actions";
import { decideCompOffAction } from "./compOffActions";
import { decideRequestAction } from "./actions";

type Decision = "approved" | "rejected";

async function decide(item: AttentionItem, decision: Decision): Promise<string | null> {
  const res =
    item.kind === "request" ? await decideRequestAction(item.id, decision) : item.kind === "log" ? await decideLogAction(item.id, decision) : await decideCompOffAction(item.id, decision, "");
  return res.ok ? null : res.error;
}

// What is waiting for you, oldest first. Leave, work from home, time logs and comp-off can be approved or rejected right
// here (rejecting asks to confirm first); expense claims and documents need more detail, so they have a Review link.
export function AttentionList({ items, total, queues }: { items: AttentionItem[]; total: number; queues: { label: string; count: number | null; href: string }[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AttentionItem | null>(null);

  const shown = items.filter((i) => !gone.has(`${i.kind}:${i.id}`));

  async function run(item: AttentionItem, decision: Decision) {
    const key = `${item.kind}:${item.id}`;
    setBusy(key);
    const problem = await decide(item, decision);
    setBusy(null);
    if (problem) return void toast.error(problem);
    setGone((g) => new Set(g).add(key));
    setConfirm(null);
    toast.success(`${item.title} ${decision} for ${item.who}.`);
    router.refresh(); // the numbers above change too
  }

  return (
    <section aria-labelledby="attention-title" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="attention-title" className="text-base font-semibold">
          Needs attention
        </h2>
        <p className="text-sm text-muted-foreground" role="status">
          {total === 0 ? "Nothing waiting" : `${total} waiting`}
        </p>
      </div>

      <nav aria-label="Review categories" className="flex flex-wrap gap-2 border-b px-4 py-3">
        {queues.map((queue) => (
          <Link key={queue.href} href={queue.href} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent">
            {queue.label} <span className="font-semibold tabular-nums">{queue.count ?? "–"}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="grid justify-items-center gap-1.5 px-4 py-10 text-center">
          <CheckCircle2 className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">Nothing is waiting for a decision right now.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const working = busy === key;
            return (
              <li key={key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <UserAvatar userId={item.userId} name={item.who} className="size-9 text-xs" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">{item.who}</span>
                      <Badge variant="outline">{item.title}</Badge>
                    </p>
                    <p className="text-sm break-words text-muted-foreground">{item.detail}</p>
                    <p className="text-xs text-muted-foreground">Waiting {waiting(item.at)}</p>
                  </div>
                </div>

                {item.inline ? (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="max-md:min-h-11" disabled={working} aria-label={`Approve ${item.title.toLowerCase()} from ${item.who}`} onClick={() => run(item, "approved")}>
                      {working && <Loader2 className="animate-spin" aria-hidden="true" />} Approve
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="max-md:min-h-11" disabled={working} aria-label={`Reject ${item.title.toLowerCase()} from ${item.who}`} onClick={() => setConfirm(item)}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <Button asChild size="sm" variant="outline" className="max-md:min-h-11">
                    <Link href={item.href}>Review</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > shown.length && shown.length > 0 && (
        <p className="border-t px-4 py-2.5 text-sm text-muted-foreground">
          Showing the {shown.length} that have waited longest. Choose a review category above to see the rest.
        </p>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && busy === null && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject this {confirm?.title.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              {confirm?.who}: {confirm?.detail}. They will be told it was rejected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => confirm && run(confirm, "rejected")}>
              {busy !== null && <Loader2 className="animate-spin" aria-hidden="true" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
