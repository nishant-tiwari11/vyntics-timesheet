// The project board: columns, the filter syntax of the search bar, and where a dropped card goes.
// Plain code with no server-only imports, so the browser and the tests can use it.
import { columnOf, isOverdue, PRIORITIES, STATUSES, type ColumnStatus, type Priority, type Status, type TicketRow } from "./model";

export type { ColumnStatus };

/** The board's columns, left to right, with the line shown under each name. */
export const COLUMNS: { status: ColumnStatus; title: string; hint: string; color: string; fill: 0 | 0.5 | 1 }[] = [
  { status: "open", title: "Open", hint: "New tickets, waiting to be picked up", color: "text-emerald-500", fill: 0 },
  { status: "assigned", title: "Assigned", hint: "Someone owns it, work hasn't started", color: "text-blue-500", fill: 0 },
  { status: "in_progress", title: "In progress", hint: "Actively being worked on", color: "text-amber-500", fill: 0.5 },
  { status: "on_hold", title: "On hold", hint: "Waiting on something else", color: "text-slate-400", fill: 0 },
  { status: "pending_review", title: "Pending review", hint: "Done, waiting to be checked", color: "text-violet-500", fill: 0.5 },
  { status: "closed", title: "Closed", hint: "Resolved and waiting for confirmation, or completed", color: "text-orange-500", fill: 1 },
];

export type BoardCard = TicketRow & { position: number; raisedByName: string; assigneeName: string | null };

/** The cards of one column, in the order they are shown (by position, then oldest first). */
export function columnCards(cards: BoardCard[], status: ColumnStatus): BoardCard[] {
  return cards.filter((c) => columnOf(c.status) === status).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** A position between two neighbours (null = no neighbour on that side), so a card can be dropped anywhere without renumbering. */
export function positionBetween(before: number | null, after: number | null, now = Date.now() / 1000): number {
  if (before === null && after === null) return now;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

// ---------- The search bar ----------
// Like a GitHub project: free words search the subject and ticket number; fields narrow it down:
//   status:open  priority:high  assignee:@me  assignee:asha  raised:@me  is:overdue  no:assignee
export type Filter = { words: string[]; status: Status[]; priority: Priority[]; assignee: string[]; raised: string[]; overdue: boolean; unassigned: boolean };

export function parseFilter(input: string): Filter {
  const f: Filter = { words: [], status: [], priority: [], assignee: [], raised: [], overdue: false, unassigned: false };
  for (const raw of input.trim().split(/\s+/).filter(Boolean)) {
    const at = raw.indexOf(":");
    if (at <= 0) {
      f.words.push(raw.toLowerCase());
      continue;
    }
    const key = raw.slice(0, at).toLowerCase();
    const value = raw.slice(at + 1).toLowerCase().replace(/_/g, "-");
    if (!value) continue;
    if (key === "status") {
      const found = STATUSES.find((s) => s.replace(/_/g, "-") === value);
      if (found) f.status.push(found);
    } else if (key === "priority") {
      const found = PRIORITIES.find((p) => p === value);
      if (found) f.priority.push(found);
    } else if (key === "assignee") f.assignee.push(value);
    else if (key === "raised") f.raised.push(value);
    else if (key === "is" && value === "overdue") f.overdue = true;
    else if (key === "no" && value === "assignee") f.unassigned = true;
    else f.words.push(raw.toLowerCase());
  }
  return f;
}

const sameName = (name: string | null, want: string, meId: string, meName: string, id: string | null) =>
  want === "@me" ? id === meId : (name ?? "").toLowerCase().includes(want) || (id === meId && meName.toLowerCase().includes(want));

export function matches(card: BoardCard, f: Filter, ctx: { meId: string; meName: string; today: string }): boolean {
  const code = `tck-${String(card.number).padStart(5, "0")}`;
  const hay = `${card.subject} ${code} ${card.category} ${card.department}`.toLowerCase();
  if (!f.words.every((w) => hay.includes(w))) return false;
  if (f.status.length && !f.status.includes(card.status)) return false;
  if (f.priority.length && !f.priority.includes(card.priority)) return false;
  if (f.assignee.length && !f.assignee.some((w) => sameName(card.assigneeName, w, ctx.meId, ctx.meName, card.assigneeId))) return false;
  if (f.raised.length && !f.raised.some((w) => sameName(card.raisedByName, w, ctx.meId, ctx.meName, card.raisedBy))) return false;
  if (f.overdue && !isOverdue(card.dueOn, card.status, ctx.today)) return false;
  if (f.unassigned && card.assigneeId) return false;
  return true;
}

// ---------- Views (saved searches shown as tabs) ----------
export type ViewId = "board" | "mine" | "review" | "overdue" | "table";
export const VIEWS: { id: ViewId; label: string; query: string; layout: "board" | "table"; hint: string }[] = [
  { id: "board", label: "Board", query: "", layout: "board", hint: "Every ticket, by status" },
  { id: "mine", label: "My items", query: "assignee:@me", layout: "board", hint: "Assigned to you" },
  { id: "review", label: "In review", query: "status:pending-review", layout: "board", hint: "Waiting to be checked" },
  { id: "overdue", label: "Overdue", query: "is:overdue", layout: "board", hint: "Past their due date" },
  { id: "table", label: "Table", query: "", layout: "table", hint: "A plain list" },
];
