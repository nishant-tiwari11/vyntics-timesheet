import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, ClipboardList, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInstantDate, formatYmd, isWeekend, addDays } from "@/lib/timesheet/dates";
import { LOCKED_MESSAGE, isLocked } from "@/lib/timesheet/rules";
import { AddLogButton } from "../dashboard/LogDialog";
import { loadWorkLog } from "./data";
import { LOCK_WARNING_DAYS, clock12, daysLeftToEdit, editHint, filterEntries, fmtDuration, groupByDay, paginate, type Entry } from "./model";
import { RetryButton } from "./RetryButton";
import { RowActions } from "./RowActions";
import { StatusBadge } from "./StatusBadge";
import { TruncatedText } from "./TruncatedText";
import { clearedFilters, hasFilters, workHref, type SortId, type WorkQuery } from "./query";

// One grid for the header and every row. On a wide screen it is a table; under 768px each entry becomes a card
// (the header row is hidden and the cells stack). ARIA table roles keep it a table for screen readers either way.
const GRID =
  "grid gap-x-4 gap-y-1 px-4 max-md:grid-cols-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,.8fr)_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.7fr)] md:items-center";

function dayTitle(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatYmd(date, { weekday: "long" });
}

function SortHeader({ id, label, query, today }: { id: SortId; label: string; query: WorkQuery; today: string }) {
  const active = query.sort === id;
  const flip = active ? (query.dir === "asc" ? "desc" : "asc") : "asc";
  const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <div role="columnheader" aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={workHref(query, { sort: id, dir: flip, page: 1 }, today)}
        scroll={false}
        className="inline-flex min-h-8 items-center gap-1 rounded-sm font-medium hover:underline"
      >
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">, sort {flip === "asc" ? "ascending" : "descending"}</span>
      </Link>
    </div>
  );
}

function Row({
  entry,
  data,
  today,
}: {
  entry: Entry;
  data: { me: { id: string; admin: boolean }; compOff: Record<string, { status: string; needsReapproval: boolean }>; off: Set<string> };
  today: string;
}) {
  const { me } = data;
  const own = entry.userId === me.id;
  const inWindow = !isLocked(entry.date, today);
  const canChange = me.admin || (own && entry.status === "pending" && inWindow);
  const lockedReason = me.admin
    ? null
    : !own
      ? null
      : entry.status === "approved"
        ? "Approved entries can't be changed."
        : entry.status === "rejected"
          ? "Rejected entries can't be changed. Use Fix and resubmit."
          : !inWindow
            ? LOCKED_MESSAGE
            : null;
  const left = own ? daysLeftToEdit(entry, today) : null;
  const dayOff = isWeekend(entry.date) || data.off.has(entry.date);
  const coff = dayOff ? data.compOff[`${entry.userId}|${entry.date}`] : undefined;
  const struck = entry.status === "rejected";

  return (
    <div
      role="row"
      className={`${GRID} border-b py-3 last:border-b-0 max-md:mx-3 max-md:mb-2 max-md:rounded-lg max-md:border max-md:py-3 ${struck ? "text-muted-foreground" : ""}`}
    >
      <div role="cell" className="min-w-0 font-medium">
        <span className="md:hidden text-xs font-normal text-muted-foreground">Project: </span>
        {entry.project || "—"}
        {me.admin && <span className="block truncate text-xs font-normal text-muted-foreground">{entry.person}</span>}
      </div>
      <div role="cell" className="whitespace-nowrap tabular-nums max-md:text-right">
        {entry.start && entry.end ? `${clock12(entry.start)} – ${clock12(entry.end)}` : "—"}
      </div>
      <div role="cell" className="whitespace-nowrap tabular-nums">
        {fmtDuration(entry.hours)}
      </div>
      <div role="cell" className="min-w-0 max-md:col-span-2">
        <TruncatedText text={entry.text} className={`line-clamp-2 text-sm break-words ${struck ? "line-through decoration-1" : ""}`} />
        {struck && (
          <p className="mt-0.5 text-xs">
            Rejected{entry.reviewedAt ? ` on ${formatInstantDate(entry.reviewedAt)}` : ""}. No reason was recorded.
          </p>
        )}
        {left !== null && left <= LOCK_WARNING_DAYS && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium">
            <Timer className="size-3" aria-hidden="true" /> {editHint(left)}
          </p>
        )}
        {coff && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Comp-off: {coff.needsReapproval ? "re-approval needed" : coff.status === "pending" ? "Pending" : coff.status === "approved" ? "Approved" : "Rejected"}
          </p>
        )}
      </div>
      <div role="cell">
        <StatusBadge status={entry.status} />
      </div>
      <div role="cell" className="max-md:col-span-2">
        <RowActions
          entry={entry}
          today={today}
          own={own}
          admin={me.admin}
          canChange={canChange}
          canFix={own && entry.status === "rejected" && inWindow}
          lockedReason={lockedReason}
        />
      </div>
    </div>
  );
}

function Pager({ query, today, page, last, rows }: { query: WorkQuery; today: string; page: number; last: number; rows: number }) {
  if (last <= 1) return <p className="px-4 py-3 text-sm text-muted-foreground" role="status">{rows} {rows === 1 ? "row" : "rows"}</p>;
  const link = (n: number) => workHref(query, { page: n }, today);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-muted-foreground" role="status">
        Page {page} of {last}
      </p>
      <nav aria-label="Pages" className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
            <Link href={link(page - 1)} rel="prev">
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="max-md:min-h-11" disabled>
            Previous
          </Button>
        )}
        {page < last ? (
          <Button asChild variant="outline" size="sm" className="max-md:min-h-11">
            <Link href={link(page + 1)} rel="next">
              Load more
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="max-md:min-h-11" disabled>
            Load more
          </Button>
        )}
      </nav>
    </div>
  );
}

export async function LogList({ query }: { query: WorkQuery }) {
  const res = await loadWorkLog(query);

  if (!res.ok) {
    return (
      <div className="ts-card ts-empty" role="alert">
        <strong>We couldn&apos;t load your time logs</strong>
        <p>{res.error}</p>
        <RetryButton />
      </div>
    );
  }

  const { entries, today, me, period, offDays, compOff, truncated } = res.data;
  const filtered = filterEntries(entries, query);
  const filtersOn = hasFilters(query);
  const mineDates = new Set(entries.filter((e) => e.userId === me.id).map((e) => e.date));
  const leave = new Set(res.data.leaveDays);
  const off = new Set(offDays);

  // Working days up to today with nothing logged: shown as highlighted empty days (only in your own, unfiltered view).
  const missing: string[] = [];
  if (!me.admin && !filtersOn) {
    for (let d = period.from; d <= period.to && d <= today && missing.length < 62; d = addDays(d, 1)) {
      if (!isWeekend(d) && !off.has(d) && !leave.has(d) && !mineDates.has(d)) missing.push(d);
    }
  }

  const groups = groupByDay(filtered, query, missing);
  const slice = paginate(groups, query.page, query.size);

  if (groups.length === 0) {
    return (
      <div className="ts-card ts-empty">
        <ClipboardList className="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden="true" />
        <strong>{filtersOn ? "No entries match these filters" : "No time logs in this period"}</strong>
        <p>
          {filtersOn
            ? "Try a wider date range, or clear the filters."
            : "Record what you worked on and for how long. It only takes a minute."}
        </p>
        {filtersOn ? (
          <Button asChild variant="outline" className="max-md:min-h-11">
            <Link href={workHref(query, clearedFilters, today)}>Clear filters</Link>
          </Button>
        ) : (
          <AddLogButton today={today} />
        )}
      </div>
    );
  }

  const shownEntries = filtered.length;
  const sortNote = query.sort === "date" ? null : "Entries are sorted inside each day.";

  return (
    <section aria-label="Time logs" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p role="status">
          {shownEntries} {shownEntries === 1 ? "entry" : "entries"}
          {filtersOn ? " match" : ""}
          {sortNote ? `. ${sortNote}` : ""}
        </p>
        <Link
          href={workHref(query, { sort: "date", dir: query.sort === "date" && query.dir === "desc" ? "asc" : "desc", page: 1 }, today)}
          scroll={false}
          className="inline-flex min-h-8 items-center gap-1 rounded-sm hover:underline max-md:min-h-11"
        >
          {query.sort === "date" && query.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />}
          {query.sort === "date" && query.dir === "asc" ? "Oldest day first" : "Newest day first"}
        </Link>
      </div>

      {truncated && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm" role="note">
          This period has more than 1,000 entries, so only the latest are shown. Choose a shorter period.
        </p>
      )}

      <div role="table" aria-label="Time logs, grouped by day" className="overflow-hidden rounded-xl border bg-card max-md:border-0 max-md:bg-transparent">
        <div role="rowgroup" className="hidden md:block">
          <div role="row" className={`${GRID} border-b bg-muted/50 py-2 text-sm`}>
            <SortHeader id="project" label="Project" query={query} today={today} />
            <SortHeader id="time" label="Time" query={query} today={today} />
            <SortHeader id="duration" label="Duration" query={query} today={today} />
            <div role="columnheader" className="font-medium">
              Description
            </div>
            <SortHeader id="status" label="Status" query={query} today={today} />
            <div role="columnheader" className="text-right font-medium">
              <span className="sr-only">Actions</span>
            </div>
          </div>
        </div>

        {slice.groups.map((g) => {
          const dayOff = isWeekend(g.date) ? "week-off" : off.has(g.date) ? "holiday" : null;
          return (
            <div role="rowgroup" key={g.date} className="max-md:mb-1">
              <div
                role="row"
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 max-md:border-0 max-md:px-3 ${g.missing ? "border-dashed bg-muted/60" : "bg-muted/30"}`}
              >
                <div role="cell" className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold">
                    {dayTitle(g.date, today)}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {formatYmd(g.date, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </h3>
                  {dayOff && g.entries.length > 0 && <Badge variant="outline">Worked on {dayOff}</Badge>}
                  {g.continued && <span className="text-xs text-muted-foreground">(continued)</span>}
                  {g.missing && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                      <CalendarPlus className="size-4" aria-hidden="true" /> No entry for this day
                    </span>
                  )}
                </div>
                <div role="cell" className="flex items-center gap-3">
                  {g.missing ? (
                    <AddLogButton today={today} date={g.date} label="Add entry" variant="outline" size="sm" />
                  ) : (
                    <span className="text-sm font-semibold tabular-nums">
                      <span className="sr-only">Day total: </span>
                      {fmtDuration(g.total)}
                    </span>
                  )}
                </div>
              </div>
              {g.shown.map((e) => (
                <Row key={e.id} entry={e} data={{ me, compOff, off }} today={today} />
              ))}
            </div>
          );
        })}

      </div>
      <Pager query={query} today={today} page={slice.page} last={slice.last} rows={slice.total} />
    </section>
  );
}
