"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CompletionInfo } from "@/app/api/profile/completion/route";

const key = (userId: string) => `ts-profile-prompt:${userId}`;

function seen(userId: string): boolean {
  try {
    return window.localStorage.getItem(key(userId)) !== null;
  } catch {
    return false; // storage blocked: show it, it only costs one extra pop-up
  }
}
function remember(userId: string) {
  try {
    window.localStorage.setItem(key(userId), new Date().toISOString());
  } catch {
    /* nothing to do */
  }
}

// The first time someone opens the portal (in this browser), if their profile isn't complete, a pop-up asks them to finish
// it: a photo, their name and the required documents. "Maybe later" or going to the profile means it isn't shown again;
// the notification inbox keeps reminding about missing documents. Nothing is fetched on later visits.
export function CompleteProfilePrompt({ userId }: { userId: string }) {
  const pathname = usePathname();
  const onProfile = pathname.startsWith("/timesheet/profile");
  const [info, setInfo] = useState<CompletionInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (onProfile || seen(userId)) return;
    let live = true;
    fetch("/api/profile/completion", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: (CompletionInfo & { ok: boolean }) | null) => {
        if (!live || !body?.ok) return;
        setInfo(body);
        if (body.percent < 100) setOpen(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, onProfile]);

  function close() {
    remember(userId);
    setOpen(false);
  }

  if (!info) return null;
  const steps = [
    { label: "Add a profile photo", done: info.hasPhoto },
    { label: "Your name is on your profile", done: info.hasName },
    { label: `Upload required documents (${info.docsDone} of ${info.docsTotal})`, done: info.docsDone >= info.docsTotal },
  ];
  // Start where the work is: the photo is on the Overview tab, the documents on their own tab.
  const href = info.hasPhoto ? "/timesheet/profile?tab=documents" : "/timesheet/profile";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome! Complete your profile</DialogTitle>
          <DialogDescription>It takes a couple of minutes, and HR needs your documents on file.</DialogDescription>
        </DialogHeader>

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Profile completion</span>
            <span role="status">{info.percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.percent} aria-label="Profile completion">
            <div className="h-full bg-foreground" style={{ width: `${info.percent}%` }} />
          </div>
        </div>

        <ul className="grid gap-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="max-md:min-h-11" onClick={close}>
            Maybe later
          </Button>
          <Button asChild className="max-md:min-h-11">
            <Link href={href} onClick={close}>
              Complete my profile
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
