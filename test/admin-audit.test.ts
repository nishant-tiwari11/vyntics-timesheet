import { describe, expect, it } from "vitest";
import { PAGE_SIZE, auditHref, dayBounds, humanize, mergeAudit, pageOf, parseAuditQuery, type AuditEvent } from "@/lib/admin/auditModel";

const TODAY = "2026-11-18";
const ev = (over: Partial<AuditEvent>): AuditEvent => ({ key: "users:1", at: "2026-11-10T10:00:00Z", source: "users", actor: "admin@vyntics.com", action: "User added", target: "asha@vyntics.com", detail: "", ...over });

describe("audit query", () => {
  it("defaults to everything over the last 30 days", () => {
    expect(parseAuditQuery({}, TODAY)).toEqual({ source: "all", q: "", from: "2026-10-20", to: "2026-11-18", page: 1 });
  });
  it("reads what is asked for and ignores nonsense", () => {
    expect(parseAuditQuery({ source: "documents", q: "  asha ", from: "2026-11-01", to: "2026-11-05", page: "3" }, TODAY)).toEqual({ source: "documents", q: "asha", from: "2026-11-01", to: "2026-11-05", page: 3 });
    expect(parseAuditQuery({ source: "x", from: "nope", page: "-4" }, TODAY)).toMatchObject({ source: "all", from: "2026-10-20", page: 1 });
    expect(parseAuditQuery({ from: "2026-11-10", to: "2026-11-01" }, TODAY)).toMatchObject({ from: "2026-11-01", to: "2026-11-10" });
    expect(parseAuditQuery({ q: "x".repeat(200) }, TODAY).q).toHaveLength(60);
  });
  it("builds a short address", () => {
    const q = parseAuditQuery({}, TODAY);
    expect(auditHref(q, {}, TODAY)).toBe("/timesheet/admin/audit");
    expect(auditHref(q, { source: "payroll" }, TODAY)).toBe("/timesheet/admin/audit?source=payroll");
    expect(auditHref(q, { page: 2, q: "asha" }, TODAY)).toBe("/timesheet/admin/audit?q=asha&page=2");
    expect(auditHref(q, { from: "2026-11-01", to: "2026-11-05" }, TODAY)).toBe("/timesheet/admin/audit?from=2026-11-01&to=2026-11-05");
  });
});

describe("humanize", () => {
  it("turns record names into words and leaves readable text alone", () => {
    expect(humanize("user_added")).toBe("User added");
    expect(humanize("password_user_created")).toBe("Password user created");
    expect(humanize("verify")).toBe("Verify");
    expect(humanize("Leave approved")).toBe("Leave approved");
    expect(humanize("")).toBe("Changed");
  });
});

describe("merging the records", () => {
  it("puts everything in one list, newest first", () => {
    const merged = mergeAudit([
      [ev({ key: "users:1", at: "2026-11-10T10:00:00Z" }), ev({ key: "users:2", at: "2026-11-12T10:00:00Z" })],
      [ev({ key: "documents:1", source: "documents", at: "2026-11-11T10:00:00Z" })],
    ]);
    expect(merged.map((e) => e.key)).toEqual(["users:2", "documents:1", "users:1"]);
  });
  it("searches who, what, on whom and the details, ignoring capitals", () => {
    const list = [ev({ key: "a", actor: "Priya" }), ev({ key: "b", target: "Ravi" }), ev({ key: "c", detail: "Role admin" }), ev({ key: "d", action: "Payslip viewed" })];
    expect(mergeAudit([list], { q: "RAVI" }).map((e) => e.key)).toEqual(["b"]);
    expect(mergeAudit([list], { q: "role" }).map((e) => e.key)).toEqual(["c"]);
    expect(mergeAudit([list], { q: "payslip" }).map((e) => e.key)).toEqual(["d"]);
    expect(mergeAudit([list], { q: "" })).toHaveLength(4);
  });
  it("never repeats an event", () => {
    expect(mergeAudit([[ev({ key: "x" })], [ev({ key: "x" })]])).toHaveLength(1);
  });
});

describe("paging and dates", () => {
  const many = Array.from({ length: 120 }, (_, i) => i);
  it("cuts the list into pages and stays inside the range", () => {
    expect(pageOf(many, 1)).toMatchObject({ page: 1, pages: 3, total: 120 });
    expect(pageOf(many, 1).rows).toHaveLength(PAGE_SIZE);
    expect(pageOf(many, 3).rows).toHaveLength(20);
    expect(pageOf(many, 99).page).toBe(3);
    expect(pageOf([], 1)).toMatchObject({ page: 1, pages: 1, total: 0, rows: [] });
  });
  it("covers whole days in office time", () => {
    expect(dayBounds("2026-11-01", "2026-11-05")).toEqual({ start: "2026-11-01T00:00:00+05:30", end: "2026-11-05T23:59:59.999+05:30" });
  });
});
