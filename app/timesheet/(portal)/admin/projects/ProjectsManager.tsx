"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Briefcase, Building2, Eye, FolderPlus, Loader2, MoreHorizontal, RotateCcw, Settings } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_HINT, CATEGORY_LABEL, CATEGORY_ORDER, type ProjectCategory } from "@/lib/timesheet/projectCategories";
import { addProjectAction, renameProjectAction, setProjectActiveAction, setProjectCategoryAction, type ProjectResult } from "./actions";

export type ProjectView = { id: string; name: string; active: boolean; category: ProjectCategory; entries: number; hours: number; lastUsed: string };

const ICON: Record<ProjectCategory, typeof Briefcase> = { client: Briefcase, internal: Building2, other: MoreHorizontal };
const ADD_LABEL: Record<ProjectCategory, string> = { client: "Add client project", internal: "Add internal project", other: "Add project" };
const PLACEHOLDER: Record<ProjectCategory, string> = { client: "For example: Client portal", internal: "For example: Hiring", other: "For example: Interview" };

// Projects in three groups: client work (one row per client project), internal work, and other (meetings). Each row shows its
// entries and hours, an eye to see every work log entry for it, and a gear for its settings (category, rename, archive).
// A project is never deleted: archiving stops it being chosen for new entries but leaves old time logs alone. It can be renamed
// only while nothing is logged against it (the database refuses otherwise).
export function ProjectsManager({ projects }: { projects: ProjectView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState<ProjectCategory | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ProjectView | null>(null);
  const [newName, setNewName] = useState("");

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
  const totalHours = Math.round(projects.reduce((n, p) => n + p.hours, 0) * 100) / 100;
  // The dialog shows the latest values after a refresh.
  const current = editing ? (projects.find((p) => p.id === editing.id) ?? editing) : null;

  const row = (p: ProjectView) => <ProjectRowView key={p.id} p={p} onSettings={() => (setEditing(p), setNewName(p.name))} />;

  return (
    <div className="grid gap-5">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        {[
          ["Active projects", String(activeCount)],
          ["Client projects", String(projects.filter((p) => p.active && p.category === "client").length)],
          ["Internal", String(projects.filter((p) => p.active && p.category === "internal").length)],
          ["Hours logged, all time", String(totalHours)],
        ].map(([label, value]) => (
          <li key={label} className="rounded-xl border bg-card p-4">
            <span className="block text-sm text-muted-foreground">{label}</span>
            <span className="mt-1 block text-3xl font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>

      {CATEGORY_ORDER.map((cat) => {
        const rows = projects.filter((p) => p.category === cat);
        const Icon = ICON[cat];
        const live = rows.filter((p) => p.active);
        const old = rows.filter((p) => !p.active);
        return (
          <section key={cat} className="grid gap-3 rounded-xl border bg-card p-4" aria-label={CATEGORY_LABEL[cat]}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">{CATEGORY_LABEL[cat]}</h2>
                  <p className="text-sm text-muted-foreground">{CATEGORY_HINT[cat]}</p>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" className="max-md:min-h-11" onClick={() => (setAdding(cat), setName(""))}>
                <FolderPlus aria-hidden="true" /> {ADD_LABEL[cat]}
              </Button>
            </div>

            {live.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">{live.map(row)}</ul>
            )}

            {old.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Archived ({old.length})</summary>
                <ul className="mt-2 divide-y rounded-lg border">{old.map(row)}</ul>
              </details>
            )}
          </section>
        );
      })}

      <Dialog open={adding !== null} onOpenChange={(o) => !o && !busy && setAdding(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{adding ? ADD_LABEL[adding] : "Add project"}</DialogTitle>
            <DialogDescription>{adding ? `It will appear under ${CATEGORY_LABEL[adding]} when people log time.` : ""}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding) void run(() => addProjectAction(name, adding), () => setAdding(null));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="new-project">Name</Label>
              <Input id="new-project" value={name} maxLength={60} placeholder={adding ? PLACEHOLDER[adding] : ""} disabled={busy} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!current} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>{current.name}</DialogTitle>
                <DialogDescription>
                  {current.entries} {current.entries === 1 ? "entry" : "entries"} · {current.hours} h logged
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-5">
                <div className="grid gap-1.5">
                  <Label htmlFor="project-category">Category</Label>
                  <Select value={current.category} onValueChange={(v) => void run(() => setProjectCategoryAction(current.id, v))} disabled={busy}>
                    <SelectTrigger id="project-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="project-name">Name</Label>
                  <div className="flex gap-2">
                    <Input id="project-name" value={newName} maxLength={60} disabled={busy || current.entries > 0} onChange={(e) => setNewName(e.target.value)} />
                    <Button type="button" variant="outline" disabled={busy || current.entries > 0 || !newName.trim() || newName.trim() === current.name} onClick={() => void run(() => renameProjectAction(current.id, newName))}>
                      Rename
                    </Button>
                  </div>
                  {current.entries > 0 && <p className="text-xs text-muted-foreground">It has time logged to it, so it can&apos;t be renamed. Archive it and add a new project instead.</p>}
                </div>

                <div className="grid gap-1.5 border-t pt-4">
                  <p className="text-sm font-medium">{current.active ? "Archive" : "Restore"}</p>
                  <p className="text-xs text-muted-foreground">
                    {current.active
                      ? "People won't be able to choose it for new time logs. Existing entries stay and still show in reports. You can restore it any time."
                      : "It will be available again when people log time."}
                  </p>
                  {current.active ? (
                    <Button type="button" variant="destructive" className="w-fit" disabled={busy || activeCount <= 1} title={activeCount <= 1 ? "At least one project must stay active" : undefined} onClick={() => void run(() => setProjectActiveAction(current.id, false), () => setEditing(null))}>
                      <Archive aria-hidden="true" /> Archive project
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => void run(() => setProjectActiveAction(current.id, true))}>
                      <RotateCcw aria-hidden="true" /> Restore project
                    </Button>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectRowView({ p, onSettings }: { p: ProjectView; onSettings: () => void }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-3 ${p.active ? "" : "text-muted-foreground"}`}>
      <p className="flex min-w-40 flex-1 items-center gap-2 font-medium">
        {p.name}
        {!p.active && <Badge variant="outline">Archived</Badge>}
      </p>
      <dl className="flex items-center gap-6 text-sm tabular-nums">
        <div className="text-right">
          <dt className="text-xs text-muted-foreground">Entries</dt>
          <dd className="font-medium">{p.entries}</dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-muted-foreground">Hours</dt>
          <dd className="font-medium">{p.hours}</dd>
        </div>
        <div className="hidden text-right sm:block">
          <dt className="text-xs text-muted-foreground">Last used</dt>
          <dd className="font-medium">{p.lastUsed || "Never"}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-1.5">
        <Button asChild variant="outline" size="icon-sm">
          <Link href={`/timesheet/admin/projects/${p.id}`} aria-label={`View all entries for ${p.name}`} title="View all entries">
            <Eye />
          </Link>
        </Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label={`Settings for ${p.name}`} title="Settings" onClick={onSettings}>
          <Settings />
        </Button>
      </div>
    </li>
  );
}
