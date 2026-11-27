"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// A real page shown in a window over the admin page you were on. The cross (or Escape, or a click outside) closes it and you are
// back where you were; the window keeps its place in the browser's history, so the Back button closes it too.
export function PageModal({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent className="flex h-[90vh] w-[min(96vw,76rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex items-center gap-3 border-b px-5 py-3 pr-14">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="sr-only">This opens in a window. Use the cross at the top right to close it.</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
