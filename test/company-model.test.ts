import { describe, expect, it } from "vitest";
import { countBy, weekHours } from "@/lib/admin/companyModel";

describe("countBy", () => {
  it("counts, sorts and names the blanks", () => {
    expect(countBy(["Dev", "Dev", "", "QA"])).toEqual([
      { name: "Dev", count: 2 },
      { name: "No department", count: 1 },
      { name: "QA", count: 1 },
    ]);
  });
  it("joins the tail as Others", () => {
    expect(countBy(["a", "b", "c", "d"], "x", 3)).toEqual([
      { name: "a", count: 1 },
      { name: "b", count: 1 },
      { name: "Others", count: 2 },
    ]);
  });
});

describe("weekHours", () => {
  const logs = [
    { date: "2026-11-16", project: "Client work", hours: 4, status: "approved" },
    { date: "2026-11-16", project: "Internal", hours: 2.5, status: "pending" },
    { date: "2026-11-17", project: "Client work", hours: 3, status: "rejected" },
    { date: "2026-11-18", project: "Client work", hours: 1, status: "approved" },
  ];
  it("sums per day and project, skipping rejected", () => {
    const w = weekHours(logs, ["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(w.perDay.map((d) => d.hours)).toEqual([6.5, 0, 1]);
    expect(w.total).toBe(7.5);
    expect(w.projects[0]).toEqual({ name: "Client work", count: 5 });
  });
});
