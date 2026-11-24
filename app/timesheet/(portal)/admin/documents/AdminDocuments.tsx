"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Download, Eye, FileArchive, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OFFERED_CATEGORIES, STATUS_LABEL, categoryLabel, expiryState, fmtSize, type DocStatus } from "@/lib/documents/config";
import type { AdminDoc, AuditRow, EmployeeDocs } from "@/lib/documents/admin";
import { formatInstantDate, formatYmd } from "@/lib/timesheet/dates";
import { UserAvatar } from "../../../_components/UserAvatar";
import { DocumentPreviewModal, type PreviewDoc } from "../../profile/documents/DocumentPreviewModal";
import { StatusBadge } from "../../profile/documents/DocumentList";
import { ReviewDialog, type ReviewTarget } from "../../profile/documents/ReviewDialog";
import { loadActivityAction, setManagerSensitiveAction } from "./actions";
import type { OnboardingRow } from "@/lib/onboarding/server";
import { ActionRequired } from "./ActionRequired";
import { OnboardingAdmin } from "./OnboardingAdmin";

const ALL = "__all__";
type View = "action" | "onboarding" | "documents" | "offer" | "activity" | "managers";
type Quick = "all" | "pending" | "expiring";

const ACTION: Record<string, string> = {
  upload: "Uploaded",
  replace: "Replaced",
  view: "Viewed",
  download: "Downloaded",
  delete: "Deleted",
  verify: "Verified",
  reject: "Rejected",
  visibility: "Changed visibility of",
};

const profileLink = (id: string) => `/timesheet/admin/access/${id}`;

export function AdminDocuments({ docs, employees, truncated, today, onboarding, initialView = "action" }: { docs: AdminDoc[]; employees: EmployeeDocs[]; truncated: boolean; today: string; onboarding: OnboardingRow[]; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  // The activity list and the offer template are only read when their tab is first opened.
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [lazyError, setLazyError] = useState<string | null>(null);
  useEffect(() => {
    if (view === "activity" && audit === null) {
      void loadActivityAction().then((res) => (res.ok ? setAudit(res.rows) : setLazyError(res.error)));
    }
  }, [view, audit]);
  const [quick, setQuick] = useState<Quick>("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [zipping, setZipping] = useState(false);
  const [, startTransition] = useTransition();
  const [sensitive, setSensitive] = useState<Record<string, boolean>>({});

  const pending = docs.filter((d) => d.status === "pending").length;
  const expiring = docs.filter((d) => expiryState(d.expiryDate, today) !== null).length;
  const people = employees.filter((e) => e.role === "employee" || e.role === "manager");
  const hasLetter = (id: string, cat: string) => docs.some((d) => d.userId === id && d.category === cat && d.status !== "rejected");
  const lettersToIssue = people.filter((e) => !hasLetter(e.id, "offer_letter") || !hasLetter(e.id, "appointment_letter")).length;
  const toVerify = docs.filter((d) => d.status === "pending" && !["offer_letter", "appointment_letter"].includes(d.category)).length;
  const unfinished = onboarding.filter((r) => r.status !== "submitted" && r.status !== "skipped").length;

  const needle = q.trim().toLowerCase();
  const shown = docs.filter(
    (d) =>
      (quick === "all" || (quick === "pending" ? d.status === "pending" : expiryState(d.expiryDate, today) !== null)) &&
      (category === ALL || d.category === category) &&
      (status === ALL || d.status === status) &&
      (!needle || `${d.employeeName} ${d.employeeEmail} ${d.name} ${d.filename}`.toLowerCase().includes(needle))
  );
  const allPicked = shown.length > 0 && shown.every((d) => picked.has(d.id));

  const togglePick = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  async function downloadZip() {
    setZipping(true);
    try {
      const res = await fetch("/api/documents/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...picked] }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't prepare the download. Please try again.");
      } else {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = `documents-${today}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Download ready.");
      }
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    }
    setZipping(false);
  }

  function toggleSensitive(e: EmployeeDocs, allowed: boolean) {
    setSensitive((s) => ({ ...s, [e.id]: allowed }));
    startTransition(async () => {
      const res = await setManagerSensitiveAction(e.id, allowed);
      if (res.ok) toast.success(res.message ?? "Saved.");
      else {
        toast.error(res.error);
        setSensitive((s) => ({ ...s, [e.id]: !allowed }));
      }
    });
  }

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "action", label: "Action required", count: lettersToIssue + toVerify },
    { id: "onboarding", label: "Onboarding", count: unfinished },
    { id: "documents", label: "All documents", count: docs.length },
    { id: "offer", label: "Offer letter" },
    { id: "activity", label: "Activity" },
    { id: "managers", label: "Manager access" },
  ];

  return (
    <div className="grid gap-4">
      <nav aria-label="Documents sections" className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={view === t.id ? "page" : undefined}
            onClick={() => setView(t.id)}
            className={`-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-medium max-md:min-h-11 ${view === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </nav>

      {view === "documents" && (
        <section className="grid gap-3" aria-label="All documents">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick filters">
            {(
              [
                ["all", `All (${docs.length})`],
                ["pending", `Pending verification (${pending})`],
                ["expiring", `Expiring in 30 days or expired (${expiring})`],
              ] as [Quick, string][]
            ).map(([id, label]) => (
              <Button key={id} type="button" size="sm" variant={quick === id ? "default" : "outline"} aria-pressed={quick === id} className="max-md:min-h-11" onClick={() => setQuick(id)}>
                {label}
              </Button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_11rem_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Search employee, document or file" aria-label="Search documents" className="pl-9 max-md:h-11" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full max-md:h-11" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {OFFERED_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full max-md:h-11" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" disabled={picked.size === 0 || zipping} className="max-md:min-h-11" onClick={downloadZip}>
              {zipping ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileArchive aria-hidden="true" />}
              Download ZIP{picked.size > 0 ? ` (${picked.size})` : ""}
            </Button>
          </div>

          {truncated && (
            <p role="note" className="rounded-md border border-dashed px-3 py-2 text-sm">
              Showing the latest 2,000 documents. Use the search to narrow it down.
            </p>
          )}

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground" role="status">
              {docs.length === 0 ? "No documents have been uploaded yet." : "No documents match these filters."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <caption className="sr-only">Employee documents</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all shown documents"
                        checked={allPicked}
                        onCheckedChange={(v) => setPicked(v === true ? new Set([...picked, ...shown.slice(0, 100).map((d) => d.id)]) : new Set([...picked].filter((id) => !shown.some((d) => d.id === id))))}
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((d) => {
                    const ex = expiryState(d.expiryDate, today);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Checkbox aria-label={`Select ${d.name}`} checked={picked.has(d.id)} onCheckedChange={() => togglePick(d.id)} />
                        </TableCell>
                        <TableCell className="min-w-44">
                          <div className="flex items-center gap-2">
                            <UserAvatar userId={d.userId} name={d.employeeName} className="size-7 text-xs" />
                            <Link href={profileLink(d.userId)} className="font-medium hover:underline">
                              {d.employeeName}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-52">
                          <div className="font-medium break-words">
                            {d.name}
                            {d.version > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">v{d.version}</span>}
                            {d.visibility === "hr_only" && (
                              <Badge variant="outline" className="ml-2">
                                HR only
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {categoryLabel(d.category)} · {fmtSize(d.size)}
                          </div>
                          {d.expiryDate && (
                            <div className={`text-xs ${ex === "expired" ? "font-medium text-destructive" : ex === "soon" ? "font-medium" : "text-muted-foreground"}`}>
                              {ex === "expired" ? "Expired " : "Expires "}
                              {formatYmd(d.expiryDate, { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                          {d.status === "rejected" && d.statusReason && <div className="mt-1 max-w-48 text-xs break-words text-destructive">{d.statusReason}</div>}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {d.uploadedBy}
                          <div>{formatInstantDate(d.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="outline" size="icon-sm" aria-label={`Preview ${d.name}`} onClick={() => setPreview({ id: d.id, name: d.name, mime: d.mime, version: d.version })}>
                              <Eye />
                            </Button>
                            <Button asChild variant="outline" size="icon-sm">
                              <a href={`/api/documents/${d.id}/download`} aria-label={`Download ${d.name}`}>
                                <Download />
                              </a>
                            </Button>
                            {d.status !== "verified" && (
                              <Button type="button" variant="outline" size="icon-sm" aria-label={`Verify ${d.name}`} onClick={() => setReview({ id: d.id, name: d.name, decision: "verified" })}>
                                <Check />
                              </Button>
                            )}
                            {d.status !== "rejected" && (
                              <Button type="button" variant="outline" size="icon-sm" aria-label={`Reject ${d.name}`} onClick={() => setReview({ id: d.id, name: d.name, decision: "rejected" })}>
                                <X />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {view === "action" && (
        <ActionRequired
          docs={docs}
          employees={employees}
          pendingOnboarding={unfinished}
          onOpenLetters={() => setView("offer")}
          onOpenOnboarding={() => setView("onboarding")}
          onPreview={setPreview}
          onReview={setReview}
        />
      )}

      {view === "onboarding" && <OnboardingAdmin rows={onboarding} onPreview={setPreview} onReview={setReview} />}

      {view === "offer" && (
        <section className="grid justify-items-start gap-3 rounded-xl border bg-card p-5" aria-label="Offer letters">
          <h2 className="text-base font-semibold">Offer letters have their own section</h2>
          <p className="text-sm text-muted-foreground">Create, preview, send and track offer and appointment letters for internships and full-time roles, with the employee accepting in the portal.</p>
          <Link href="/timesheet/admin/offers" className="inline-flex min-h-9 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background max-md:min-h-11">
            Open Offer letters
          </Link>
        </section>
      )}

      {view === "activity" && (
        <section className="grid gap-3" aria-label="Document activity">
          <p className="text-sm text-muted-foreground">The latest 100 things done with documents: who, what and when.</p>
          {audit === null ? (
            <p role="status" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{lazyError ?? "Loading the activity…"}</p>
          ) : audit.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {audit.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{a.actor}</span> {(ACTION[a.action] ?? a.action).toLowerCase()} <span className="font-medium">{a.document}</span>
                  {a.employee && <span className="text-muted-foreground"> ({a.employee})</span>}
                  <span className="block text-xs text-muted-foreground">
                    {formatInstantDate(a.at)}
                    {a.detail ? ` · ${a.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "managers" && (
        <section className="grid gap-3" aria-label="Manager access to sensitive documents">
          <p className="text-sm text-muted-foreground">
            Managers can see their own team&apos;s documents, except ID proof, bank details and salary slips. Turn a switch on to let that manager see those too. Admins always see everything.
          </p>
          {employees.filter((e) => e.role === "manager").length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">There are no managers yet. Give someone the Manager role on the Access page.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {employees
                .filter((e) => e.role === "manager")
                .map((e) => {
                  const on = sensitive[e.id] ?? e.canViewSensitive;
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar userId={e.id} name={e.name} className="size-8 text-xs" />
                        <div className="min-w-0">
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs break-all text-muted-foreground">{e.email}</p>
                        </div>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-sm">
                        <span>Can see sensitive documents</span>
                        <Switch checked={on} onCheckedChange={(v) => toggleSensitive(e, v)} aria-label={`${e.name} can see sensitive documents`} />
                      </label>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
      <ReviewDialog target={review} onClose={() => setReview(null)} />
    </div>
  );
}
