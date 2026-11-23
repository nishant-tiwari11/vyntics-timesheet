"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { splitName } from "@/lib/nameFromEmail";
import { setNameAction } from "../actions";

// For people whose email isn't on the company domain, the admin types the name. Employees can't change it themselves.
export function EditName({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const start = splitName(name);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(start.first);
  const [last, setLast] = useState(start.last);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setNameAction(userId, first, last);
      if (!res.ok) return setError(res.error);
      toast.success("Name saved.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit name
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
            <DialogDescription>This is the name shown across the portal and on documents. The employee can&apos;t change it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-first">First name</Label>
              <Input id="edit-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} disabled={pending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-last">Last name</Label>
              <Input id="edit-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} disabled={pending} />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
