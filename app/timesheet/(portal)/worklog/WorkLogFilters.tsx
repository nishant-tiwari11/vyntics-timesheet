"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, CopyPlus, Download, FileSpreadsheet, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormField, Input, Select } from "../../_components/Fields";
import { CopyYesterdayButton } from "./CopyYesterdayButton";
import { STATUS_OPTIONS, clearedFilters, hasFilters, workHref, type SortId, type StatusId, type WorkQuery } from "./query";

// The ways to order the list. Each one is a sort and a direction, kept in the address like every other setting.
const SORT_CHOICES: { id: string; label: string; sort: SortId; dir: "asc" | "desc" }[] = [
  { id: "newest", label: "Newest first", sort: "date", dir: "desc" },
  { id: "oldest", label: "Oldest first", sort: "date", dir: "asc" },
  { id: "project", label: "Project (A to Z)", sort: "project", dir: "asc" },
  { id: "longest", label: "Longest first", sort: "duration", dir: "desc" },
  { id: "shortest", label: "Shortest first", sort: "duration", dir: "asc" },
  { id: "time", label: "Time of day", sort: "time", dir: "asc" },
  { id: "status", label: "Status", sort: "status", dir: "asc" },
];

// One tidy row above the entries: Filter (project, status, dates, search in a pop-up), Sort by, and a menu with Export and
// Copy yesterday's entries. Every change goes into the address (so it can be bookmarked and survives a refresh) and goes back
// to page 1. Typing in the search box waits a moment before it searches.
export function WorkLogFilters({
  query,
  today,
  projects,
  showCopy = false,
}: {
  query: WorkQuery;
  today: string;
  /** Every project name, archived ones too (old entries can still be filtered). */
  projects: string[];
  /** Offer "Copy yesterday's entries" in the menu (employees only). */
  showCopy?: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copySignal, setCopySignal] = useState(0);

  const go = (change: Partial<WorkQuery>, replace = false) =>
    startTransition(() => {
      const href = workHref(query, { ...change, page: 1 }, today);
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });

  // The search box keeps what you are typing; the address follows after a short pause.
  const [draft, setDraft] = useState(query.q);
  const [seen, setSeen] = useState(query.q);
  if (seen !== query.q) {
    // The address changed by itself (Clear filters, the back button): show what it now says.
    setSeen(query.q);
    setDraft(query.q);
  }
  useEffect(() => {
    const term = draft.trim();
    if (term === query.q) return;
    const timer = setTimeout(() => {
      setSeen(term);
      startTransition(() => router.replace(workHref(query, { q: term, page: 1 }, today), { scroll: false }));
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, query, today, router]);

  const active = hasFilters(query);
  const count = [query.project !== "all", query.status !== "all", query.q !== "", query.user !== "", query.from !== "", query.to !== ""].filter(Boolean).length;
  const sortNow = SORT_CHOICES.find((c) => c.sort === query.sort && c.dir === query.dir) ?? SORT_CHOICES[0];
  const exportHref = workHref(query, { page: 1 }, today, "/timesheet/worklog/export");
  const csvHref = `${exportHref}${exportHref.includes("?") ? "&" : "?"}format=csv`;

  return (
    <div role="search" aria-label="Filter and sort time logs" aria-busy={busy} className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="max-md:min-h-11">
            <SlidersHorizontal aria-hidden="true" /> Filter
            {count > 0 && (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background" aria-label={`${count} ${count === 1 ? "filter" : "filters"} on`}>
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-[22rem] max-w-[calc(100vw-2rem)] gap-3">
          <FormField label="Search descriptions">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="search" value={draft} maxLength={60} placeholder="Search what you worked on" style={{ paddingLeft: 36 }} onChange={(e) => setDraft(e.target.value)} />
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Project">
              <Select value={query.project} onChange={(e) => go({ project: e.target.value })}>
                <option value="all">All projects</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={query.status} onChange={(e) => go({ status: e.target.value as StatusId })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="From date">
              <Input type="date" value={query.from} max={query.to || undefined} onChange={(e) => go({ from: e.target.value })} />
            </FormField>
            <FormField label="To date">
              <Input type="date" value={query.to} min={query.from || undefined} onChange={(e) => go({ to: e.target.value })} />
            </FormField>
          </div>
          {active && (
            <Button type="button" variant="ghost" size="sm" className="w-fit max-md:min-h-11" onClick={() => go(clearedFilters)}>
              <X aria-hidden="true" /> Clear filters
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
        <ArrowUpDown className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">Sort by</span>
        <select
          aria-label="Sort by"
          className="h-9 w-44 rounded-[var(--radius)] border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-foreground/20 max-md:h-11"
          value={sortNow.id}
          onChange={(e) => {
            const choice = SORT_CHOICES.find((c) => c.id === e.target.value);
            if (choice) go({ sort: choice.sort, dir: choice.dir });
          }}
        >
          {SORT_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {active && (
        <Button type="button" variant="ghost" size="sm" className="max-md:min-h-11" onClick={() => go(clearedFilters)}>
          <X aria-hidden="true" /> Clear filters
        </Button>
      )}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="max-md:size-11" aria-label="More: export and copy yesterday's entries">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={exportHref} download>
                <FileSpreadsheet aria-hidden="true" /> Export Excel
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={csvHref} download>
                <Download aria-hidden="true" /> Export CSV
              </a>
            </DropdownMenuItem>
            {showCopy && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCopySignal((n) => n + 1)}>
                  <CopyPlus aria-hidden="true" /> Copy yesterday&apos;s entries
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {showCopy && <CopyYesterdayButton today={today} hideButton startSignal={copySignal} />}
      </div>
    </div>
  );
}
