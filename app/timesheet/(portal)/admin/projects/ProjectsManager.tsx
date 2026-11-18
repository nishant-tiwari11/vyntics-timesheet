"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, FolderPlus, Loader2, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProjectAction, renameProjectAction, setProjectActiveAction, type ProjectResult } from "./actions";

export type ProjectView = { id: string; name: string; active: boolean; entries: number; hours: number; lastUsed: string };

// Add, rename and archive projects. A project is never deleted: archiving stops it being chosen for new entries but leaves old
// time logs alone. It can be renamed only while nothing is logged against it (the database refuses otherwise).
export function ProjectsManager({ projects }: { projects: ProjectView[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<ProjectView | null>(null);
  const [newName, setNewName] = useState("");
  const [archiving, setArchiving] = useState<ProjectView | null>(null);

  async function run(task: () => Promise<ProjectResult>, then?: () => void) {
    setBusy(true);
    const res = await task();
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message);
    then?.();
    router.refresh();
  }

  const activeCount = projects.filter((p) => p.active).length;

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => addProjectAction(name), () => setName(""));
        }}
      >
        <div className="grid min-w-52 flex-1 gap-1.5">
          <Label htmlFor="new-project">New project</Label>
          <Input id="new-project" value={name} maxLength={60} placeholder="For example: Research" disabled={busy} onChange={(e) => setName(e.target.value)} className="max-md:h-11" />
        </div>
        <Button type="submit" disabled={busy || !name.trim()} className="max-md:min-h-11">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FolderPlus aria-hidden="true" />} Add project
        </Button>
      </form>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No projects yet. Add the first one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-max text-sm">
            <caption className="sr-only">Projects</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-4 py-2.5 font-medium">Project</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Entries</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Hours</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Last used</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map((p) => (
                <tr key={p.id} className={p.active ? "" : "text-muted-foreground"}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {p.name}
                  </th>
                  <td className="px-4 py-2.5">{p.active ? <Badge>Active</Badge> : <Badge variant="outline">Archived</Badge>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.entries}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.hours}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{p.lastUsed || "Never"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      {p.entries === 0 && (
                        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} aria-label={`Rename ${p.name}`} onClick={() => (setRenaming(p), setNewName(p.name))}>
                          <Pencil aria-hidden="true" /> Rename
                        </Button>
                      )}
                      {p.active ? (
                        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy || activeCount <= 1} title={activeCount <= 1 ? "At least one project must stay active" : undefined} aria-label={`Archive ${p.name}`} onClick={() => setArchiving(p)}>
                          <Archive aria-hidden="true" /> Archive
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} aria-label={`Restore ${p.name}`} onClick={() => void run(() => setProjectActiveAction(p.id, true))}>
                          <RotateCcw aria-hidden="true" /> Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Archiving a project stops it being chosen for new time logs; the hours already logged to it stay. A project can be renamed only while nothing is logged to it.
      </p>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && !busy && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Nothing has been logged to &ldquo;{renaming?.name}&rdquo; yet, so it can be renamed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rename-project">New name</Label>
            <Input id="rename-project" value={newName} maxLength={60} disabled={busy} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !newName.trim()} onClick={() => renaming && void run(() => renameProjectAction(renaming.id, newName), () => setRenaming(null))}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiving} onOpenChange={(o) => !o && !busy && setArchiving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive &ldquo;{archiving?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              People won&apos;t be able to choose it for new time logs. Existing entries ({archiving?.entries ?? 0}, {archiving?.hours ?? 0} h) are kept and still show in reports. You can restore it any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setArchiving(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => archiving && void run(() => setProjectActiveAction(archiving.id, false), () => setArchiving(null))}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
