"use client";

import { CalendarDays, ChevronsLeftRight, Eye, Kanban, Loader2, MessageSquare, MoreHorizontal, Paperclip, Plus, Search, Table2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COLUMNS, columnCards, matches, parseFilter, positionBetween, VIEWS, type BoardCard, type ColumnStatus } from "@/lib/tickets/board";
import { columnOf, isOverdue, noteNeeded, PRIORITY_LABEL, PRIORITY_TONE, routeTo, STATUS_LABEL, targetStatus, ticketCode, type Status } from "@/lib/tickets/model";
import type { Category } from "@/lib/tickets/server";
import { UserAvatar } from "../../_components/UserAvatar";
import { assignAction, boardAction, moveTicketAction, ticketPeopleAction } from "./actions";
import CreateTicketDialog from "./CreateTicketDialog";
import TicketDrawer from "./TicketDrawer";
import { fmtDate, fmtDateTime, PriorityTag, selectClass, StatusPill } from "./parts";

type Pending =
  | { kind: "note"; card: BoardCard; to: Status; position: number }
  | { kind: "assign"; card: BoardCard; position: number };

type SavedView = { id: string; label: string; query: string };

// ---------- Views you save yourself ("New view"), kept in this browser, per project ----------
const savedKey = (project: string) => `ts-ticket-views:${project}`;
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("ts-ticket-views", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("ts-ticket-views", cb);
  };
}
function useSavedViews(project: string): [SavedView[], (next: SavedView[]) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(savedKey(project)) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]"
  );
  const views = useMemo<SavedView[]>(() => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v): v is SavedView => !!v && typeof v.id === "string" && typeof v.label === "string" && typeof v.query === "string").slice(0, 12) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const save = useCallback(
    (next: SavedView[]) => {
      try {
        window.localStorage.setItem(savedKey(project), JSON.stringify(next));
      } catch {
        toast.error("Couldn't save the view in this browser.");
        return;
      }
      window.dispatchEvent(new Event("ts-ticket-views"));
    },
    [project]
  );
  return [views, save];
}

/** A GitHub-style status icon: an outline circle, half filled while work is under way, with a tick once it is done. */
function StatusIcon({ color, fill, className = "size-4" }: { color: string; fill: 0 | 0.5 | 1; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`${color} ${className} shrink-0`}>
      {fill === 1 ? <circle cx="8" cy="8" r="7" fill="currentColor" /> : <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {fill === 0.5 && <path d="M8 3.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />}
      {fill === 1 && <path d="M4.75 8.25l2.25 2.25 4.25-4.5" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

const colorOf = (status: Status) => COLUMNS.find((c) => c.status === columnOf(status));

// A project's tickets as a board, in the style of a GitHub project: views as tabs (and "New view" to save your own), a search bar
// with fields, a View menu, and one tall column per status that fills the width. Cards can be dragged between columns (that changes
// the ticket's status, with the same checks as everywhere else) and up or down inside a column. Every card also has a Move menu,
// so the board works with a keyboard and on a phone. Changes show at once and are undone with a message if the server says no.
export default function ProjectBoard({
  project,
  initial,
  categories,
  people,
  who,
  today,
  canMove,
  canRaise,
  fill = false,
}: {
  project: string;
  initial: BoardCard[];
  categories: Category[];
  /** People a new ticket can be assigned to. */
  people: { id: string; name: string }[];
  who: { id: string; name: string; email: string };
  today: string;
  canMove: boolean;
  canRaise: boolean;
  /** Fill the height of the window (the ticket dashboard page): the columns share the width and scroll inside, so the page never scrolls. */
  fill?: boolean;
}) {
  const [cards, setCards] = useState(initial);
  const [view, setView] = useState<string>("board");
  const [layoutOverride, setLayoutOverride] = useState<"board" | "table" | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<ColumnStatus>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: ColumnStatus; index: number } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [saved, setSaved] = useSavedViews(project);
  const busy = useRef(0);

  const builtIn = VIEWS.find((v) => v.id === view);
  const layout = layoutOverride ?? builtIn?.layout ?? "board";
  const filter = useMemo(() => parseFilter(query), [query]);
  const ctx = useMemo(() => ({ meId: who.id, meName: who.name, today }), [who.id, who.name, today]);
  const shown = useMemo(() => cards.filter((c) => matches(c, filter, ctx)), [cards, filter, ctx]);
  const filtering = query.trim().length > 0;

  const reload = useCallback(async () => {
    const res = await boardAction(project);
    if (res.ok) setCards(res.cards);
  }, [project]);

  // Others change things too: look again every 30 seconds, unless a change is on its way.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || busy.current > 0) return;
      reload();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  function chooseView(id: string, q: string) {
    setView(id);
    setQuery(q);
    setLayoutOverride(null);
  }

  /** Send a move to the server. The board already shows it; if the server refuses, put everything back. */
  async function commit(card: BoardCard, to: Status | null, note: string | null, position: number, extra?: Partial<BoardCard>) {
    const before = cards;
    setCards((list) => list.map((c) => (c.id === card.id ? { ...c, ...extra, status: (to ?? c.status) as Status, position } : c)));
    busy.current++;
    const res = await moveTicketAction(card.id, to, note, position);
    busy.current--;
    if (!res.ok) {
      setCards(before);
      toast.error(res.error);
      return false;
    }
    if (to) toast.success(`${ticketCode(card.number)} moved to ${STATUS_LABEL[to]}.`);
    return true;
  }

  /** Move a card to a column, at a place in it. Checks the workflow first and asks for what the move needs (a note, or a person). */
  function requestMove(card: BoardCard, to: ColumnStatus, index: number) {
    const others = columnCards(cards, to).filter((c) => c.id !== card.id);
    const position = positionBetween(others[index - 1]?.position ?? null, others[index]?.position ?? null);
    if (columnOf(card.status) === to) {
      if (others.length > 0) void commit(card, null, null, position); // alone in its column: nothing to reorder
      return;
    }
    const target = targetStatus(card.status, to);
    if (!routeTo(card.status, target)) {
      toast.error(`A ticket can't go from ${STATUS_LABEL[card.status]} to ${STATUS_LABEL[target]}.`);
      return;
    }
    if (target === "assigned" && !card.assigneeId) return setPending({ kind: "assign", card, position });
    if (noteNeeded(target)) return setPending({ kind: "note", card, to: target, position });
    void commit(card, target, null, position);
  }

  // ---------- Dragging ----------
  function indexAt(column: HTMLElement, y: number): number {
    const items = Array.from(column.querySelectorAll<HTMLElement>("[data-card-id]")).filter((el) => el.dataset.cardId !== dragId);
    let index = 0;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) index++;
    }
    return index;
  }

  const dragged = dragId ? cards.find((c) => c.id === dragId) : undefined;
  const canDropOn = (status: ColumnStatus) => !!dragged && (columnOf(dragged.status) === status || routeTo(dragged.status, targetStatus(dragged.status, status)) !== null);

  const tab = (active: boolean) =>
    `-mb-px inline-flex items-center gap-1.5 rounded-t-md border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-border border-b-background bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`;

  return (
    <section className={fill ? "flex h-full min-h-0 flex-col gap-3" : "grid gap-3"} aria-label={`Tickets for ${project}`}>
      {/* Views */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div role="tablist" aria-label="Ticket views" className="flex flex-wrap gap-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} title={v.hint} onClick={() => chooseView(v.id, v.query)} className={tab(view === v.id)}>
              {v.layout === "table" ? <Table2 className="size-4" aria-hidden="true" /> : <Kanban className="size-4" aria-hidden="true" />}
              {v.label}
            </button>
          ))}
          {saved.map((v) => (
            <span key={v.id} className={`group ${tab(view === v.id)} pr-1.5`}>
              <button type="button" role="tab" aria-selected={view === v.id} onClick={() => chooseView(v.id, v.query)} className="inline-flex items-center gap-1.5">
                <Kanban className="size-4" aria-hidden="true" />
                {v.label}
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Delete the view ${v.label}`}
                onClick={() => {
                  setSaved(saved.filter((x) => x.id !== v.id));
                  if (view === v.id) chooseView("board", "");
                }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button type="button" className="-mb-px inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" onClick={() => setNaming(true)}>
            <Plus className="size-4" aria-hidden="true" /> New view
          </button>
        </div>
        {canRaise && (
          <Button type="button" size="sm" className="mb-1.5" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Raise ticket
          </Button>
        )}
      </div>

      {/* Search and the View menu */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-[3px] focus-within:ring-ring/50">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by keyword or by field: status:open priority:high assignee:@me is:overdue" aria-label="Filter tickets" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {shown.length}
            <span className="sr-only"> of {cards.length} tickets shown</span>
          </span>
          {filtering && (
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Clear the filter" onClick={() => setQuery("")}>
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {filtering && !saved.some((v) => v.query === query.trim()) && !VIEWS.some((v) => v.query === query.trim() && v.query) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setNaming(true)}>
            Save as view
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Eye aria-hidden="true" /> View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Layout</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLayoutOverride("board")}>
              <Kanban aria-hidden="true" /> Board {layout === "board" && "✓"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLayoutOverride("table")}>
              <Table2 aria-hidden="true" /> Table {layout === "table" && "✓"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCollapsed(new Set(COLUMNS.map((c) => c.status)))}>Collapse all columns</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCollapsed(new Set())}>Expand all columns</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => reload()}>Refresh</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {layout === "table" ? (
        <div className={fill ? "min-h-0 flex-1 overflow-auto" : undefined}>
          <BoardTable cards={shown} today={today} onOpen={setOpenId} />
        </div>
      ) : (
        <div className={fill ? "flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto" : "flex items-stretch gap-3 overflow-x-auto pb-2"}>
          {COLUMNS.map((col) => {
            const list = columnCards(shown, col.status);
            const all = columnCards(cards, col.status);
            const overdue = all.filter((c) => isOverdue(c.dueOn, c.status, today)).length;
            const isCollapsed = collapsed.has(col.status);
            const target = !!dragId && canDropOn(col.status);
            const active = over?.status === col.status && target;
            if (isCollapsed) {
              return (
                <button
                  key={col.status}
                  type="button"
                  onClick={() => setCollapsed((s) => new Set([...s].filter((x) => x !== col.status)))}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const card = cards.find((c) => c.id === dragId);
                    setDragId(null);
                    setOver(null);
                    if (!card) return;
                    if (canDropOn(col.status)) requestMove(card, col.status, columnCards(cards, col.status).filter((c) => c.id !== card.id).length);
                    else toast.error(`A ticket can't go from ${STATUS_LABEL[card.status]} to ${STATUS_LABEL[targetStatus(card.status, col.status)]}.`);
                  }}
                  aria-label={`Expand ${col.title}, ${list.length} tickets`} className={`flex w-11 shrink-0 flex-col items-center gap-3 rounded-xl border bg-card py-3 text-sm transition-colors hover:bg-accent/40 ${fill ? "h-full" : "min-h-[26rem]"}`}>
                  <ChevronsLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  <StatusIcon color={col.color} fill={col.fill} />
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{list.length}</span>
                  <span className="[writing-mode:vertical-rl] font-semibold">{col.title}</span>
                </button>
              );
            }
            return (
              <div
                key={col.status}
                role="group"
                aria-label={`${col.title}, ${list.length} tickets`}
                className={`flex flex-col rounded-xl border bg-card transition-colors ${fill ? "h-full min-h-0 min-w-56 flex-1 basis-0 xl:min-w-0" : "max-h-[calc(100vh-14rem)] min-h-[26rem] min-w-64 flex-1 basis-64"} ${active ? "border-foreground/50 bg-accent/30" : ""} ${dragId && !target ? "opacity-50" : ""}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const index = indexAt(e.currentTarget, e.clientY);
                  if (target) setOver((o) => (o?.status === col.status && o.index === index ? o : { status: col.status, index }));
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o?.status === col.status ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const card = cards.find((c) => c.id === dragId);
                  const index = indexAt(e.currentTarget, e.clientY);
                  setDragId(null);
                  setOver(null);
                  if (card && canDropOn(col.status)) requestMove(card, col.status, index);
                  else if (card) toast.error(`A ticket can't go from ${STATUS_LABEL[card.status]} to ${STATUS_LABEL[targetStatus(card.status, col.status)]}.`);
                }}
              >
                <div className="grid gap-1 p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <StatusIcon color={col.color} fill={col.fill} />
                    <h3 className="text-sm font-semibold">{col.title}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{filtering ? `${list.length} / ${all.length}` : all.length}</span>
                    {overdue > 0 && <span className="rounded-full border border-red-300 px-2 py-0.5 text-xs text-red-600 dark:border-red-800 dark:text-red-300">{overdue} overdue</span>}
                    <div className="ml-auto flex items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`${col.title} options`}>
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setCollapsed((s) => new Set(s).add(col.status))}>Collapse column</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {col.status === "open" && canRaise && (
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Add a ticket to Open" onClick={() => setCreating(true)}>
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">{col.hint}</p>
                </div>

                <div className="grid min-h-12 flex-1 content-start gap-2 overflow-y-auto p-2 pt-1">
                  {list.length === 0 && !active && <p className="px-3 py-6 text-center text-xs text-muted-foreground">{all.length === 0 ? "Nothing here yet" : "No tickets match the filter"}</p>}
                  {list.map((c, i) => (
                    <div key={c.id} className="grid gap-2">
                      {active && over.index === i && dragId !== c.id && <DropSlot />}
                      <TicketCard
                        card={c}
                        today={today}
                        canMove={canMove}
                        dragging={dragId === c.id}
                        onOpen={() => setOpenId(c.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(c.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onMoveTo={(to) => requestMove(c, to, columnCards(cards, to).filter((x) => x.id !== c.id).length)}
                      />
                    </div>
                  ))}
                  {active && over.index >= list.filter((c) => c.id !== dragId).length && <DropSlot />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MoveDialog pending={pending} onClose={() => setPending(null)} onConfirm={commit} />
      <NewViewDialog
        open={naming}
        query={query.trim()}
        onClose={() => setNaming(false)}
        onSave={(label, q) => {
          const id = `v${Date.now().toString(36)}`;
          setSaved([...saved, { id, label, query: q }]);
          chooseView(id, q);
          setNaming(false);
          toast.success(`View "${label}" saved.`);
        }}
      />

      <CreateTicketDialog
        open={creating}
        onOpenChange={setCreating}
        project={project}
        categories={categories}
        people={people}
        canTriage={canMove}
        onCreated={() => void reload()}
      />
      <TicketDrawer id={openId} today={today} onClose={() => setOpenId(null)} onChanged={reload} />
    </section>
  );
}

/** Where a dragged card will land. */
function DropSlot() {
  return <div aria-hidden="true" className="h-16 rounded-lg border-2 border-dashed border-foreground/30 bg-accent/30" />;
}

// ---------- A card ----------
function TicketCard({
  card,
  today,
  canMove,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onMoveTo,
}: {
  card: BoardCard;
  today: string;
  canMove: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMoveTo: (to: ColumnStatus) => void;
}) {
  const overdue = isOverdue(card.dueOn, card.status, today);
  const col = colorOf(card.status);
  const targets = canMove ? COLUMNS.filter((c) => c.status !== columnOf(card.status) && routeTo(card.status, targetStatus(card.status, c.status)) !== null) : [];
  const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs";
  return (
    <article data-card-id={card.id} draggable={canMove} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`group grid gap-2 rounded-lg border bg-background p-3 text-sm transition ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : "hover:border-foreground/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {col && <StatusIcon color={col.color} fill={col.fill} className="size-3.5" />}
        <span>{ticketCode(card.number)}</span>
        <span className="ml-auto flex items-center -space-x-1.5">
          <span title={`Raised by ${card.raisedByName}`}>
            <UserAvatar userId={card.raisedBy} name={card.raisedByName} className="size-5 border border-background text-[9px]" />
          </span>
          {card.assigneeId && (
            <span title={`Assigned to ${card.assigneeName}`}>
              <UserAvatar userId={card.assigneeId} name={card.assigneeName} className="size-5 border border-background text-[9px]" />
            </span>
          )}
        </span>
        {targets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="-my-1 rounded p-1 hover:bg-accent hover:text-foreground" aria-label={`Move ${ticketCode(card.number)}`}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {targets.map((t) => (
                <DropdownMenuItem key={t.status} onSelect={() => onMoveTo(t.status)}>
                  {STATUS_LABEL[targetStatus(card.status, t.status)]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpen}>Open ticket</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <button type="button" onClick={onOpen} className="text-left font-semibold leading-snug break-words hover:text-primary hover:underline focus-visible:underline">
        {card.subject}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${pill} text-muted-foreground`}>{card.category}</span>
        <span className={pill}>
          <span aria-hidden="true" className={`size-2 rounded-full ${PRIORITY_TONE[card.priority]}`} />
          {PRIORITY_LABEL[card.priority]}
        </span>
        {card.status === "resolved" && <span className={`${pill} text-teal-600 dark:text-teal-300`}>Awaiting confirmation</span>}
        {card.dueOn && (
          <span className={`${pill} ${overdue ? "border-red-300 text-red-600 dark:border-red-800 dark:text-red-300" : "text-muted-foreground"}`}>
            <CalendarDays className="size-3" aria-hidden="true" />
            {fmtDate(card.dueOn)}
            {overdue && " · Overdue"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="truncate">{card.department}</span>
        <span className="ml-auto whitespace-nowrap">{fmtDate(card.createdAt)}</span>
        {card.comments > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" aria-hidden="true" /> {card.comments}
            <span className="sr-only"> comments</span>
          </span>
        )}
        {card.attachments > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="size-3" aria-hidden="true" /> {card.attachments}
            <span className="sr-only"> attachments</span>
          </span>
        )}
      </div>
    </article>
  );
}

// ---------- Saving a view ----------
function NewViewDialog({ open, query, onClose, onSave }: { open: boolean; query: string; onClose: () => void; onSave: (label: string, query: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">{open && <NewViewForm query={query} onClose={onClose} onSave={onSave} />}</DialogContent>
    </Dialog>
  );
}
function NewViewForm({ query, onClose, onSave }: { query: string; onClose: () => void; onSave: (label: string, query: string) => void }) {
  const [name, setName] = useState("");
  const [q, setQ] = useState(query);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 1) return toast.error("Give the view a name.");
        onSave(name.trim().slice(0, 30), q.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>New view</DialogTitle>
        <DialogDescription>A view is a saved search. It is kept in this browser.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <label htmlFor="tk-view-name" className="text-sm font-medium">
          Name
        </label>
        <Input id="tk-view-name" autoFocus value={name} maxLength={30} placeholder="e.g. Urgent and unassigned" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="tk-view-query" className="text-sm font-medium">
          Filter
        </label>
        <Input id="tk-view-query" value={q} placeholder="priority:urgent no:assignee" onChange={(e) => setQ(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save view</Button>
      </DialogFooter>
    </form>
  );
}

// ---------- A move that needs a note or a person ----------
function MoveDialog({ pending, onClose, onConfirm }: { pending: Pending | null; onClose: () => void; onConfirm: (card: BoardCard, to: Status | null, note: string | null, position: number, extra?: Partial<BoardCard>) => Promise<boolean> }) {
  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{pending && <MoveForm key={pending.card.id + pending.kind} pending={pending} onClose={onClose} onConfirm={onConfirm} />}</DialogContent>
    </Dialog>
  );
}

function MoveForm({ pending, onClose, onConfirm }: { pending: Pending; onClose: () => void; onConfirm: (card: BoardCard, to: Status | null, note: string | null, position: number, extra?: Partial<BoardCard>) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [person, setPerson] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(pending.kind === "assign" ? null : []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pending.kind !== "assign") return;
    let live = true;
    ticketPeopleAction(pending.card.id).then((r) => live && setPeople(r.ok ? r.people.filter((p) => p.canHandle) : []));
    return () => {
      live = false;
    };
  }, [pending]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (pending.kind === "note") {
      if (note.trim().length < 3) {
        setSaving(false);
        return toast.error("Write the resolution notes first.");
      }
      const ok = await onConfirm(pending.card, pending.to, note.trim(), pending.position);
      setSaving(false);
      if (ok) onClose();
      return;
    }
    // Assigning someone also moves the ticket to Assigned; then it is put in the place it was dropped.
    const chosen = people?.find((p) => p.id === person);
    if (!chosen) {
      setSaving(false);
      return toast.error("Choose who will handle it.");
    }
    const res = await assignAction(pending.card.id, chosen.id);
    if (!res.ok) {
      setSaving(false);
      return toast.error(res.error);
    }
    const ok = await onConfirm(pending.card, null, null, pending.position, { status: "assigned", assigneeId: chosen.id, assigneeName: chosen.name });
    setSaving(false);
    if (ok) {
      toast.success(`${ticketCode(pending.card.number)} assigned to ${chosen.name}.`);
      onClose();
    }
  }

  return (
    <form onSubmit={go} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{pending.kind === "note" ? `Resolve ${ticketCode(pending.card.number)}` : `Assign ${ticketCode(pending.card.number)}`}</DialogTitle>
        <DialogDescription>{pending.kind === "note" ? "Say what was done. The person who raised the ticket sees this and can confirm the fix." : "Choose who will handle this ticket. It moves to Assigned."}</DialogDescription>
      </DialogHeader>
      {pending.kind === "note" ? (
        <Textarea autoFocus rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done to fix it?" aria-label="Resolution notes" />
      ) : people === null ? (
        <div className="h-9 animate-pulse rounded-md bg-muted" aria-busy="true" />
      ) : (
        <select className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Assign to">
          <option value="">Choose a person…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />} {pending.kind === "note" ? "Resolve ticket" : "Assign"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- The Table view ----------
function BoardTable({ cards, today, onOpen }: { cards: BoardCard[]; today: string; onOpen: (id: string) => void }) {
  if (cards.length === 0) return <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No tickets match.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">Tickets</caption>
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="px-3 py-2">Ticket</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Assigned to</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const overdue = isOverdue(c.dueOn, c.status, today);
            return (
              <tr key={c.id} className="cursor-pointer border-b last:border-b-0 hover:bg-accent/40" onClick={() => onOpen(c.id)}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{ticketCode(c.number)}</td>
                <td className="max-w-80 px-3 py-2">
                  <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>
                    {c.subject}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-3 py-2">
                  <PriorityTag priority={c.priority} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{c.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${overdue ? "font-medium text-red-600" : ""}`}>{c.dueOn ? fmtDate(c.dueOn) : <span className="text-muted-foreground">-</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDateTime(c.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
