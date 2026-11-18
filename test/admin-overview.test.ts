import { describe, expect, it } from "vitest";
import { ADMIN_NAV, activeAdminNav } from "@/lib/admin/nav";
import { notLoggedToday, sortAttention, waiting, type AttentionItem } from "@/lib/admin/overviewModel";

describe("admin navigation", () => {
  it("has every section from the brief, in order", () => {
    expect(ADMIN_NAV.map((i) => i.label)).toEqual([
      "Overview",
      "Users & Roles",
      "Projects",
      "Holidays & Leave Policy",
      "Approvals",
      "Payroll & Expenses",
      "Documents",
      "Reports",
      "Audit Log",
      "Settings",
    ]);
  });
  it("marks the sections that aren't built yet (no link), and every built one has a link", () => {
    const soon = ADMIN_NAV.filter((i) => !i.href).map((i) => i.id);
    expect(soon).toEqual(["projects", "settings"]);
  });
  it("knows which item is open from the address", () => {
    expect(activeAdminNav("/timesheet/admin", null)).toBe("overview");
    expect(activeAdminNav("/timesheet/admin/", null)).toBe("overview");
    expect(activeAdminNav("/timesheet/admin", "requests")).toBe("approvals");
    expect(activeAdminNav("/timesheet/admin", "logs")).toBe("approvals");
    expect(activeAdminNav("/timesheet/admin", "compoff")).toBe("approvals");
    expect(activeAdminNav("/timesheet/admin", "holidays")).toBe("holidays");
    expect(activeAdminNav("/timesheet/admin", "employees")).toBe("users");
    expect(activeAdminNav("/timesheet/admin/access", null)).toBe("users");
    expect(activeAdminNav("/timesheet/admin/documents", null)).toBe("documents");
    expect(activeAdminNav("/timesheet/admin/reports", null)).toBe("reports");
    expect(activeAdminNav("/timesheet/admin/audit", null)).toBe("audit");
    expect(activeAdminNav("/timesheet/payroll/runs", null)).toBe("payroll");
    expect(activeAdminNav("/timesheet/admin", "nonsense")).toBeNull();
    expect(activeAdminNav("/timesheet/dashboard", null)).toBeNull();
  });
});

describe("what needs attention", () => {
  const item = (over: Partial<AttentionItem>): AttentionItem => ({
    id: "1",
    kind: "request",
    userId: "u",
    who: "Asha",
    title: "Leave",
    detail: "",
    at: "2026-11-10T10:00:00Z",
    inline: true,
    href: "/x",
    ...over,
  });
  it("puts the longest-waiting first and keeps only the most", () => {
    const sorted = sortAttention([item({ id: "new", at: "2026-11-12T00:00:00Z" }), item({ id: "old", at: "2026-11-01T00:00:00Z" }), item({ id: "mid", at: "2026-11-05T00:00:00Z" })], 2);
    expect(sorted.map((i) => i.id)).toEqual(["old", "mid"]);
  });
  it("doesn't change the list it is given", () => {
    const list = [item({ id: "b", at: "2026-11-02T00:00:00Z" }), item({ id: "a", at: "2026-11-01T00:00:00Z" })];
    sortAttention(list, 5);
    expect(list.map((i) => i.id)).toEqual(["b", "a"]);
  });
  it("says how long something has waited", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(waiting("2026-11-18T11:59:30Z", now)).toBe("just now");
    expect(waiting("2026-11-18T11:30:00Z", now)).toBe("30 min");
    expect(waiting("2026-11-18T09:00:00Z", now)).toBe("3 h");
    expect(waiting("2026-11-17T12:00:00Z", now)).toBe("1 day");
    expect(waiting("2026-11-14T12:00:00Z", now)).toBe("4 days");
    expect(waiting("nonsense", now)).toBe("");
  });
});

describe("who hasn't logged today", () => {
  const people = [
    { id: "a", role: "employee" },
    { id: "b", role: "manager" },
    { id: "c", role: "employee" },
    { id: "d", role: "viewer" },
    { id: "e", role: "employee", status: "disabled" },
    { id: "f", role: "admin" },
  ];
  it("counts active people with no time logged and not on leave, leaving out viewers and disabled accounts", () => {
    const hours = new Map([["a", 8]]);
    expect(notLoggedToday({ people, hoursById: hours, onLeave: new Set(["c"]), dayOff: false })).toBe(2); // b (manager) and f (admin)
  });
  it("counts someone with zero hours, but not someone with some", () => {
    expect(notLoggedToday({ people: [{ id: "a", role: "employee" }], hoursById: new Map([["a", 0]]), onLeave: new Set(), dayOff: false })).toBe(1);
    expect(notLoggedToday({ people: [{ id: "a", role: "employee" }], hoursById: new Map([["a", 0.5]]), onLeave: new Set(), dayOff: false })).toBe(0);
  });
  it("is null on a day off, when nobody is expected to log", () => {
    expect(notLoggedToday({ people, hoursById: new Map(), onLeave: new Set(), dayOff: true })).toBeNull();
  });
});
