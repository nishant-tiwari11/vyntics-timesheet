"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CALENDARS, type CalendarId, type EventItem } from "@/lib/timesheet/eventTypes";
import { cn } from "@/lib/utils";
import EventDialog, { type DialogState } from "./EventDialog";
import MiniMonth from "./MiniMonth";
import { MonthView, TimeGrid } from "./Views";
import { COLOR_CLASS } from "./eventStyles";
import { VIEWS, eventsHref, shift, titleFor, type EventsQuery } from "./eventsQuery";

export default function EventsApp({
  items,
  warnings,
  q,
  today,
  isAdmin,
  myId,
}: {
  items: EventItem[];
  warnings: string[];
  q: EventsQuery;
  today: string;
  isAdmin: boolean;
  myId: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<CalendarId>>(new Set());
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  // Say plainly when a part of the calendar could not load, with a way to try again.
  const warningKey = warnings.join("|");
  useEffect(() => {
    if (!warningKey) return;
    toast.error(warningKey.split("|").join(" "), { id: "events-warning", action: { label: "Retry", onClick: () => router.refresh() } });
  }, [warningKey, router]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(
      (e) =>
        !hidden.has(e.calendar) &&
        (!needle || [e.title, e.description, e.location, e.ownerName].some((t) => t.toLowerCase().includes(needle)))
    );
  }, [items, hidden, search]);

  function toggle(id: CalendarId, on: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const common = {
    q,
    today,
    items: visible,
    onOpen: (e: EventItem) => setDialog({ mode: "view", event: e }),
    onCreate: (date: string, startTime?: string) => setDialog({ mode: "create", date, startTime }),
  };

  const sidebar = (
    <div className="grid gap-6">
      <MiniMonth q={q} today={today} />
      <section aria-labelledby="calendars-title">
        <h2 id="calendars-title" className="mb-2 text-sm font-medium">
          Calendars
        </h2>
        <ul className="grid gap-0.5">
          {CALENDARS.map((c) => (
            <li key={c.id} className="flex min-h-9 items-center gap-2.5 rounded-md px-1 transition-colors hover:bg-accent/60">
              <Checkbox id={`cal-${c.id}`} checked={!hidden.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
              <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-sm border", COLOR_CLASS[c.color])} />
              <Label htmlFor={`cal-${c.id}`} className="flex-1 cursor-pointer py-2 text-sm font-normal">
                {c.label}
              </Label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Calendar sidebar">
        {sidebar}
      </aside>

      <div className="grid min-w-0 gap-4">
        <h1 className="sr-only">Events</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={eventsHref(q.view, today, today)}>Today</Link>
          </Button>
          <div className="flex">
            <Button asChild variant="ghost" size="icon" aria-label="Previous">
              <Link href={eventsHref(q.view, shift(q, -1), today)}>
                <ChevronLeft aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Next">
              <Link href={eventsHref(q.view, shift(q, 1), today)}>
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <h2 className="mr-auto min-w-0 text-lg font-semibold tracking-tight sm:text-xl" aria-live="polite">
            {titleFor(q)}
          </h2>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <CalendarDays aria-hidden="true" /> Calendars
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto p-4">
              <SheetHeader className="p-0">
                <SheetTitle>Calendars</SheetTitle>
                <SheetDescription>Pick a day or choose which calendars to show.</SheetDescription>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>

          <nav aria-label="Calendar view" className="flex rounded-md border p-0.5">
            {VIEWS.map((v) => (
              <Link
                key={v.id}
                href={eventsHref(v.id, q.on, today)}
                aria-current={q.view === v.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  q.view === v.id && "bg-primary text-primary-foreground hover:text-primary-foreground"
                )}
              >
                {v.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Label htmlFor="ev-search" className="sr-only">
              Search events
            </Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="ev-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" className="pl-9" autoComplete="off" />
          </div>
          <Button onClick={() => setDialog({ mode: "create", date: q.on })} className="ml-auto">
            <Plus aria-hidden="true" /> Create event
          </Button>
        </div>

        {q.view === "month" ? <MonthView {...common} /> : <TimeGrid {...common} />}

        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {search || hidden.size > 0 ? "Nothing matches your search and calendars." : "No events in this period. Click a day or Create event to add one."}
          </p>
        )}
      </div>

      <EventDialog
        state={dialog}
        onClose={() => setDialog(null)}
        isAdmin={isAdmin}
        myId={myId}
        onEdit={(event) => setDialog({ mode: "edit", event })}
      />
    </div>
  );
}
