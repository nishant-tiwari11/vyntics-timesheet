import { describe, expect, it } from "vitest";
import { blocks, columnOf, inline, isOverdue, mentionIds, nextStatuses, noteNeeded, routeTo, sniffFile, targetStatus, ticketCode, type Who } from "@/lib/tickets/model";

const raiser: Who = { raiser: true, staff: false, admin: false };
const staff: Who = { raiser: false, staff: true, admin: false };
const admin: Who = { raiser: false, staff: false, admin: true };
const nobody: Who = { raiser: false, staff: false, admin: false };

describe("ticket workflow", () => {
  it("walks open → assigned → in progress → pending review → resolved for the team handling it", () => {
    expect(nextStatuses("open", staff)).toEqual(["assigned", "in_progress", "on_hold"]);
    expect(nextStatuses("assigned", staff)).toContain("in_progress");
    expect(nextStatuses("in_progress", staff)).toEqual(expect.arrayContaining(["pending_review", "resolved", "on_hold"]));
    expect(nextStatuses("pending_review", staff)).toContain("resolved");
  });
  it("lets only the raiser confirm or reopen a resolved ticket (the team may also close it)", () => {
    expect(nextStatuses("resolved", raiser).sort()).toEqual(["closed", "reopened"]);
    expect(nextStatuses("resolved", staff)).toEqual(["closed"]);
    expect(nextStatuses("resolved", nobody)).toEqual([]);
  });
  it("lets the raiser withdraw an open ticket but not move it along", () => {
    expect(nextStatuses("open", raiser)).toEqual(["closed"]);
    expect(nextStatuses("in_progress", raiser)).toEqual([]);
  });
  it("only allows a closed ticket to be reopened", () => {
    expect(nextStatuses("closed", raiser)).toEqual(["reopened"]);
    expect(nextStatuses("closed", staff)).toEqual([]);
    expect(nextStatuses("closed", admin)).toEqual(["reopened"]);
  });
  it("needs notes to resolve or reopen", () => {
    expect(noteNeeded("resolved")).toBe("resolution");
    expect(noteNeeded("reopened")).toBe("reopen");
    expect(noteNeeded("in_progress")).toBeNull();
  });
  it("shows a reopened ticket in the Open column", () => {
    expect(columnOf("reopened")).toBe("open");
    expect(columnOf("on_hold")).toBe("on_hold");
    expect(columnOf("resolved")).toBe("closed");
  });
  it("resolves on a drop on Closed, and closes a ticket that is already resolved", () => {
    expect(targetStatus("in_progress", "closed")).toBe("resolved");
    expect(targetStatus("pending_review", "closed")).toBe("resolved");
    expect(targetStatus("resolved", "closed")).toBe("closed");
    expect(targetStatus("open", "in_progress")).toBe("in_progress");
  });
});

describe("moving a card across several columns", () => {
  it("goes through In progress to reach Pending review or Resolved from the early statuses", () => {
    expect(routeTo("open", "pending_review")).toEqual(["in_progress", "pending_review"]);
    expect(routeTo("assigned", "pending_review")).toEqual(["in_progress", "pending_review"]);
    expect(routeTo("on_hold", "resolved")).toEqual(["in_progress", "resolved"]);
    expect(routeTo("open", "resolved")).toEqual(["in_progress", "resolved"]);
  });
  it("takes a direct step when the workflow has one", () => {
    expect(routeTo("in_progress", "pending_review")).toEqual(["pending_review"]);
    expect(routeTo("open", "assigned")).toEqual(["assigned"]);
    expect(routeTo("resolved", "closed")).toEqual(["closed"]);
  });
  it("closes in steps, and refuses to go backwards", () => {
    expect(routeTo("in_progress", "closed")).toEqual(["resolved", "closed"]);
    expect(routeTo("open", "closed")).toEqual(["in_progress", "resolved", "closed"]);
    expect(routeTo("in_progress", "open")).toBeNull();
    expect(routeTo("pending_review", "assigned")).toBeNull();
    expect(routeTo("closed", "in_progress")).toBeNull();
  });
  it("has no steps when it is already there", () => expect(routeTo("open", "open")).toEqual([]));
});

describe("ticket helpers", () => {
  it("formats the ticket number", () => expect(ticketCode(42)).toBe("TCK-00042"));
  it("is overdue only while the ticket is still being worked on", () => {
    expect(isOverdue("2026-11-01", "open", "2026-11-27")).toBe(true);
    expect(isOverdue("2026-11-01", "resolved", "2026-11-27")).toBe(false);
    expect(isOverdue("2026-11-27", "open", "2026-11-27")).toBe(false);
    expect(isOverdue(null, "open", "2026-11-27")).toBe(false);
  });
  it("finds the people tagged in a comment", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(mentionIds(`Hi @[Asha Rao](${id}) and @[Asha Rao](${id})`)).toEqual([id]);
    expect(mentionIds("no tags @nobody")).toEqual([]);
  });
});

describe("the text formatter", () => {
  it("turns **bold**, _italic_ and `code` into pieces, never into markup", () => {
    expect(inline("a **b** _c_ `d`").map((p) => p.kind)).toEqual(["text", "bold", "text", "italic", "text", "code"]);
    expect(inline("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
  });
  it("shows a tag as @Name", () => {
    expect(inline("hi @[Asha](123e4567-e89b-12d3-a456-426614174000)")[1]).toEqual({ kind: "mention", text: "@Asha" });
  });
  it("builds paragraphs and lists", () => {
    const b = blocks("Intro\n\n- one\n- two\n\n1. first\n2. second");
    expect(b.map((x) => x.kind)).toEqual(["p", "ul", "ol"]);
    expect(b[1].kind === "ul" && b[1].items.length).toBe(2);
  });
});

describe("richer text (headings, quotes, tasks, links)", () => {
  it("builds headings, quotes and task lists", () => {
    const b = blocks("### Steps\n> it broke\n> twice\n- [ ] check logs\n- [x] restart");
    expect(b.map((x) => x.kind)).toEqual(["h", "quote", "tasks"]);
    expect(b[0].kind === "h" && b[0].level).toBe(3);
    expect(b[2].kind === "tasks" && b[2].items.map((i) => i.done)).toEqual([false, true]);
  });
  it("makes a link only for an http or https address", () => {
    expect(inline("see [docs](https://example.com/a?b=1)")[1]).toEqual({ kind: "link", text: "docs", href: "https://example.com/a?b=1" });
    expect(inline("[x](javascript:alert(1))").every((p) => p.kind !== "link")).toBe(true);
    expect(inline("[x](data:text/html;base64,AAA)").every((p) => p.kind !== "link")).toBe(true);
  });
  it("still reads a tagged person as a mention, not a link", () => {
    expect(inline("@[Asha](123e4567-e89b-12d3-a456-426614174000)")).toEqual([{ kind: "mention", text: "@Asha" }]);
  });
});

describe("file checks", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  it("recognises a file by its first bytes, not its name", () => {
    expect(sniffFile(png, "x.png")?.mime).toBe("image/png");
    expect(sniffFile(png, "renamed.exe")?.mime).toBe("image/png");
    expect(sniffFile(Uint8Array.from([0x4d, 0x5a, 0x90, 0]), "virus.png")).toBeNull();
  });
  it("accepts Word and Excel (zip) files only with the right extension", () => {
    expect(sniffFile(zip, "a.docx")?.ext).toBe("docx");
    expect(sniffFile(zip, "a.xlsx")?.ext).toBe("xlsx");
    expect(sniffFile(zip, "a.zip")).toBeNull();
  });
});
