import { describe, expect, it } from "vitest";
import { COLUMNS, columnCards, matches, parseFilter, positionBetween, VIEWS, type BoardCard } from "@/lib/tickets/board";

const card = (over: Partial<BoardCard> = {}): BoardCard => ({
  id: "t1",
  number: 7,
  subject: "Laptop will not start",
  status: "open",
  priority: "medium",
  department: "IT",
  category: "IT Support",
  raisedBy: "u-raiser",
  assigneeId: null,
  dueOn: null,
  createdAt: "2026-11-20T10:00:00Z",
  updatedAt: "2026-11-20T10:00:00Z",
  comments: 0,
  attachments: 0,
  position: 1,
  raisedByName: "Asha Rao",
  assigneeName: null,
  ...over,
});
const ctx = { meId: "u-me", meName: "Vipul Sharma", today: "2026-11-27" };

describe("board columns", () => {
  it("has the six columns in workflow order (no separate Resolved column)", () => {
    expect(COLUMNS.map((c) => c.status)).toEqual(["open", "assigned", "in_progress", "on_hold", "pending_review", "closed"]);
  });
  it("shows a resolved ticket in the Closed column", () => {
    expect(columnCards([card({ id: "r", status: "resolved" }), card({ id: "c", status: "closed" })], "closed").map((c) => c.id).sort()).toEqual(["c", "r"]);
  });
  it("shows a reopened ticket in the Open column, ordered by position", () => {
    const list = columnCards([card({ id: "a", position: 5 }), card({ id: "b", status: "reopened", position: 2 }), card({ id: "c", status: "closed" })], "open");
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("dropping a card", () => {
  it("puts it between its neighbours, or at either end", () => {
    expect(positionBetween(1, 3)).toBe(2);
    expect(positionBetween(null, 4)).toBe(3);
    expect(positionBetween(4, null)).toBe(5);
    expect(positionBetween(null, null, 100)).toBe(100);
  });
});

describe("the search bar", () => {
  it("searches words in the subject and the ticket number", () => {
    expect(matches(card(), parseFilter("laptop"), ctx)).toBe(true);
    expect(matches(card(), parseFilter("tck-00007"), ctx)).toBe(true);
    expect(matches(card(), parseFilter("printer"), ctx)).toBe(false);
  });
  it("filters by status and priority", () => {
    expect(matches(card({ status: "pending_review" }), parseFilter("status:pending-review"), ctx)).toBe(true);
    expect(matches(card({ status: "pending_review" }), parseFilter("status:open"), ctx)).toBe(false);
    expect(matches(card({ priority: "high" }), parseFilter("priority:high"), ctx)).toBe(true);
    expect(matches(card({ priority: "low" }), parseFilter("priority:high"), ctx)).toBe(false);
  });
  it("knows @me, names and unassigned", () => {
    expect(matches(card({ assigneeId: "u-me", assigneeName: "Vipul Sharma" }), parseFilter("assignee:@me"), ctx)).toBe(true);
    expect(matches(card({ assigneeId: "u-x", assigneeName: "Ved" }), parseFilter("assignee:@me"), ctx)).toBe(false);
    expect(matches(card({ assigneeId: "u-x", assigneeName: "Ved Sharma" }), parseFilter("assignee:ved"), ctx)).toBe(true);
    expect(matches(card(), parseFilter("no:assignee"), ctx)).toBe(true);
    expect(matches(card({ assigneeId: "u-x", assigneeName: "Ved" }), parseFilter("no:assignee"), ctx)).toBe(false);
    expect(matches(card({ raisedBy: "u-me" }), parseFilter("raised:@me"), ctx)).toBe(true);
  });
  it("finds overdue tickets, but not resolved ones", () => {
    expect(matches(card({ dueOn: "2026-11-01" }), parseFilter("is:overdue"), ctx)).toBe(true);
    expect(matches(card({ dueOn: "2026-11-01", status: "resolved" }), parseFilter("is:overdue"), ctx)).toBe(false);
    expect(matches(card({ dueOn: "2026-12-01" }), parseFilter("is:overdue"), ctx)).toBe(false);
  });
  it("combines words and fields, and ignores a field with no value", () => {
    expect(matches(card({ priority: "high" }), parseFilter("laptop priority:high"), ctx)).toBe(true);
    expect(matches(card({ priority: "low" }), parseFilter("laptop priority:high"), ctx)).toBe(false);
    expect(parseFilter("status:").status).toEqual([]);
  });
  it("has views whose searches work", () => {
    for (const v of VIEWS) expect(() => parseFilter(v.query)).not.toThrow();
    expect(matches(card({ status: "pending_review" }), parseFilter(VIEWS.find((v) => v.id === "review")!.query), ctx)).toBe(true);
  });
});
