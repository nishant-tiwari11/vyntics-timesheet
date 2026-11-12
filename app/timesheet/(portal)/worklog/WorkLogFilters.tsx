"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECTS } from "@/lib/timesheet/projects";
import { FormField, Input, Select } from "../../_components/Fields";
import { STATUS_OPTIONS, clearedFilters, hasFilters, workHref, type StatusId, type WorkQuery } from "./query";

// Project, status, date range and search. Every change goes into the address (so it can be bookmarked and survives
// a refresh) and goes back to page 1. Typing in the search box waits a moment before it searches.
export function WorkLogFilters({ query, today }: { query: WorkQuery; today: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

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
  const exportHref = workHref(query, { page: 1 }, today, "/timesheet/worklog/export");

  return (
    <form
      role="search"
      aria-label="Filter time logs"
      aria-busy={busy}
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"
    >
      <FormField label="Search descriptions" className="sm:col-span-2 lg:col-span-1">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={draft}
            maxLength={60}
            placeholder="Search what you worked on"
            style={{ paddingLeft: 36 }}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      </FormField>

      <FormField label="Project">
        <Select value={query.project} onChange={(e) => go({ project: e.target.value })}>
          <option value="all">All projects</option>
          {PROJECTS.map((p) => (
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

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-full">
        {active && (
          <Button type="button" variant="ghost" size="sm" className="max-md:min-h-11" onClick={() => go(clearedFilters)}>
            <X aria-hidden="true" /> Clear filters
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="ml-auto max-md:min-h-11">
          <a href={exportHref} download>
            <Download aria-hidden="true" /> Export CSV
          </a>
        </Button>
      </div>
    </form>
  );
}
