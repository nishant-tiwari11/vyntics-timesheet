"use client";

import { MessageSquare, Paperclip, Plus, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isOverdue, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, ticketCode } from "@/lib/tickets/model";
import type { Category, Summary, TicketList } from "@/lib/tickets/server";
import { UserAvatar } from "../../_components/UserAvatar";
import RaiseTicketDrawer, { type Prefill } from "./RaiseTicket";
import TicketDrawer from "./TicketDrawer";
import { fmtDate, fmtDateTime, PriorityTag, selectClass, StatusPill } from "./parts";

type Scope = "mine" | "assigned" | "all";

const TITLE: Record<Scope, string> = { mine: "My tickets", assigned: "Assigned to me", all: "All tickets" };
const SUB: Record<Scope, string> = {
  mine: "Tickets you raised. Open one to follow its progress, add comments or confirm the fix.",
  assigned: "Tickets that are assigned to you.",
  all: "Every ticket you are allowed to see.",
};

const CARDS: { key: keyof Summary; label: string; status?: string }[] = [
  { key: "total", label: "Total tickets" },
  { key: "open", label: "Open", status: "open" },
  { key: "inProgress", label: "In progress", status: "in_progress" },
  { key: "pendingReview", label: "Pending review", status: "pending_review" },
  { key: "resolved", label: "Resolved", status: "resolved" },
  { key: "overdue", label: "Overdue" },
];

// The ticket list: summary cards, search and filters (kept in the address, so a page can be shared or reloaded), a table, and the
// drawers for raising a ticket and for reading one. Which tickets come back is decided by the database.
export default function TicketsView({
  scope,
  list,
  summary,
  categories,
  who,
  today,
  canRaise,
  openId,
  openRaise,
}: {
  scope: Scope;
  list: TicketList;
  summary: Summary;
  categories: Category[];
  who: { id: string; name: string; email: string };
  today: string;
  canRaise: boolean;
  openId: string | null;
  openRaise: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [opened, setOpened] = useState<string | null>(openId);
  const [raising, setRaising] = useState(openRaise);
  const prefill = useMemo<Prefill | undefined>(() => {
    const log = params.get("log");
    return log || params.get("subject") ? { workLogId: log ?? undefined, subject: params.get("subject") ?? undefined, categoryName: params.get("category_name") ?? undefined, project: params.get("project") ?? undefined } : undefined;
  }, [params]);

  const [q, setQ] = useState(params.get("q") ?? "");
  const lastQ = useRef(params.get("q") ?? "");

  /** Change one or more filters; this reloads the list from the server. */
  const setFilters = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in changes)) next.delete("page");
      next.delete("t");
      next.delete("new");
      startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [params, pathname, router]
  );

  // Typing in the search box reloads the list after a short pause.
  useEffect(() => {
    if (q === lastQ.current) return;
    const timer = window.setTimeout(() => {
      lastQ.current = q;
      setFilters({ q: q.trim() || null });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [q, setFilters]);

  const status = params.get("status") ?? "";
  const filtered = ["q", "status", "priority", "category", "from", "to"].some((k) => params.get(k));
  const reload = () => startTransition(() => router.refresh());

  function open(id: string | null) {
    setOpened(id);
    const next = new URLSearchParams(window.location.search);
    if (id) next.set("t", id);
    else next.delete("t");
    next.delete("new");
    // On the "Raise Ticket" page the address goes back to the plain list.
    const base = pathname.endsWith("/tickets/new") ? "/timesheet/tickets" : pathname;
    window.history.replaceState(null, "", `${base}${next.size ? `?${next}` : ""}`);
  }

  return (
    <div className="grid gap-5" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{TITLE[scope]}</h1>
          <p className="text-sm text-muted-foreground">{SUB[scope]}</p>
        </div>
        {canRaise && (
          <Button type="button" onClick={() => setRaising(true)}>
            <Plus aria-hidden="true" /> Raise ticket
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Ticket summary">
        {CARDS.map((c) => {
          const active = c.status ? status === c.status : false;
          const body = (
            <>
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
              <span className={`text-2xl font-semibold tabular-nums ${c.key === "overdue" && summary.overdue > 0 ? "text-red-600" : ""}`}>{summary[c.key]}</span>
            </>
          );
          return c.status ? (
            <button key={c.key} type="button" aria-pressed={active} onClick={() => setFilters({ status: active ? null : c.status! })} className={`grid gap-1 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:border-foreground/40 ${active ? "border-foreground" : ""}`}>
              {body}
            </button>
          ) : (
            <div key={c.key} className="grid gap-1 rounded-xl border bg-card p-3 shadow-xs">
              {body}
            </div>
          );
        })}
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter tickets" onSubmit={(e) => e.preventDefault()}>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject…" aria-label="Search tickets" maxLength={80} className={`${selectClass} pl-8`} />
        </div>
        <select className={`${selectClass} w-auto`} aria-label="Status" value={status} onChange={(e) => setFilters({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className={`${selectClass} w-auto`} aria-label="Priority" value={params.get("priority") ?? ""} onChange={(e) => setFilters({ priority: e.target.value || null })}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select className={`${selectClass} w-auto`} aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => setFilters({ category: e.target.value || null })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="grid gap-0.5 text-xs text-muted-foreground">
          From
          <input type="date" className={`${selectClass} w-auto`} value={params.get("from") ?? ""} max={params.get("to") ?? today} onChange={(e) => setFilters({ from: e.target.value || null })} />
        </label>
        <label className="grid gap-0.5 text-xs text-muted-foreground">
          To
          <input type="date" className={`${selectClass} w-auto`} value={params.get("to") ?? ""} min={params.get("from") ?? undefined} max={today} onChange={(e) => setFilters({ to: e.target.value || null })} />
        </label>
        <select className={`${selectClass} w-auto`} aria-label="Sort by" value={params.get("sort") ?? "newest"} onChange={(e) => setFilters({ sort: e.target.value === "newest" ? null : e.target.value })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="due">Due date</option>
        </select>
        {filtered && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(""); lastQ.current = ""; startTransition(() => router.replace(pathname, { scroll: false })); }}>
            <X aria-hidden="true" /> Clear
          </Button>
        )}
      </form>

      {list.rows.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>{filtered ? "No tickets match these filters" : scope === "mine" ? "You haven't raised any tickets" : scope === "assigned" ? "Nothing is assigned to you" : "No tickets yet"}</strong>
          <p>{filtered ? "Try removing a filter or searching for something else." : scope === "mine" ? "Something wrong with a time log, a leave, or your pay? Raise a ticket and the right team will pick it up." : "New tickets will show up here."}</p>
          {!filtered && scope === "mine" && canRaise && (
            <Button type="button" onClick={() => setRaising(true)}>
              <Plus aria-hidden="true" /> Raise your first ticket
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">{TITLE[scope]}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                {scope !== "mine" && <TableHead>Raised by</TableHead>}
                <TableHead>Assigned to</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => {
                const overdue = isOverdue(r.dueOn, r.status, today);
                return (
                  <TableRow key={r.id} data-state={opened === r.id ? "selected" : undefined} className="cursor-pointer" onClick={() => open(r.id)}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{ticketCode(r.number)}</TableCell>
                    <TableCell className="max-w-80">
                      <button type="button" className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); open(r.id); }}>
                        {r.subject}
                      </button>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="truncate">
                          {r.category} · {r.department}
                        </span>
                        {r.comments > 0 && (
                          <span className="inline-flex items-center gap-1" title={`${r.comments} comments`}>
                            <MessageSquare className="size-3" aria-hidden="true" />
                            {r.comments}
                            <span className="sr-only"> comments</span>
                          </span>
                        )}
                        {r.attachments > 0 && (
                          <span className="inline-flex items-center gap-1" title={`${r.attachments} attachments`}>
                            <Paperclip className="size-3" aria-hidden="true" />
                            {r.attachments}
                            <span className="sr-only"> attachments</span>
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <PriorityTag priority={r.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={r.status} />
                    </TableCell>
                    {scope !== "mine" && (
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar userId={r.raisedBy} name={r.raisedByName} className="size-6 text-[10px]" />
                          <span className="whitespace-nowrap text-sm">{r.raisedByName}</span>
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      {r.assigneeId ? (
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar userId={r.assigneeId} name={r.assigneeName} className="size-6 text-[10px]" />
                          <span className="whitespace-nowrap text-sm">{r.assigneeName}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.dueOn ? <span className={overdue ? "font-medium text-red-600" : undefined}>{fmtDate(r.dueOn)}{overdue && <span className="ml-1 text-xs">Overdue</span>}</span> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtDateTime(r.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {list.pages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          <span className="text-muted-foreground">
            Page {list.page} of {list.pages} · {list.total} tickets
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={list.page <= 1} onClick={() => setFilters({ page: String(list.page - 1) })}>
              Previous
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={list.page >= list.pages} onClick={() => setFilters({ page: String(list.page + 1) })}>
              Next
            </Button>
          </div>
        </nav>
      )}

      <RaiseTicketDrawer
        open={raising}
        onOpenChange={(o) => {
          setRaising(o);
          // Closing the drawer on the "Raise Ticket" page (or one opened with ?new=1) goes back to the plain list.
          if (!o && pathname.endsWith("/tickets/new")) router.replace("/timesheet/tickets");
          else if (!o && window.location.search.includes("new=1")) window.history.replaceState(null, "", pathname);
        }}
        who={who}
        prefill={prefill}
        onCreated={(id) => {
          reload();
          open(id);
        }}
      />
      <TicketDrawer id={opened} today={today} onClose={() => open(null)} onChanged={reload} />
    </div>
  );
}
