import { describe, expect, it } from "vitest";
import {
  buildHoursTable,
  buildLeaveTable,
  buildUnderTargetTable,
  expectedWorkingDays,
  leaveDaysByPerson,
  parseReportQuery,
  presetRange,
  reportHref,
  tableToCsv,
  type LogRow,
} from "@/lib/admin/reportsModel";

const TODAY = "2026-11-18"; // a Wednesday
const ID = "3f2c1d9e-8a4b-4c1e-9d7a-0b5e6f7a8b9c";

describe("report query", () => {
  it("defaults to this month, hours, everyone", () => {
    expect(parseReportQuery({}, TODAY)).toEqual({ report: "hours", from: "2026-11-01", to: "2026-11-30", employee: "all", project: "all", group: "employee" });
  });
  it("reads what is asked for and ignores nonsense", () => {
    const q = parseReportQuery({ report: "under", from: "2026-10-01", to: "2026-10-31", employee: ID, project: "Internal", group: "project" }, TODAY);
    expect(q).toEqual({ report: "under", from: "2026-10-01", to: "2026-10-31", employee: ID, project: "Internal", group: "project" });
    const bad = parseReportQuery({ report: "x", from: "nope", to: "2026-13-99", employee: "../etc", group: "zzz" }, TODAY);
    expect(bad).toMatchObject({ report: "hours", from: "2026-11-01", employee: "all", project: "all", group: "employee" });
    // The project list is in the database now, so any name (up to 60 characters) is kept; an unknown one simply matches nothing.
    expect(parseReportQuery({ project: "Research" }, TODAY).project).toBe("Research");
    expect(parseReportQuery({ project: "x".repeat(61) }, TODAY).project).toBe("all");
  });
  it("swaps dates given the wrong way round and caps the range", () => {
    expect(parseReportQuery({ from: "2026-11-10", to: "2026-11-01" }, TODAY)).toMatchObject({ from: "2026-11-01", to: "2026-11-10" });
    const long = parseReportQuery({ from: "2000-01-01", to: "2026-11-30" }, TODAY);
    expect(long.to).toBe("2026-11-30");
    expect(long.from).toBe("2025-11-30"); // 366 days
  });
  it("has the preset ranges", () => {
    expect(presetRange("this-week", TODAY)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(presetRange("last-week", TODAY)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(presetRange("this-month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("last-month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("builds a short address, leaving out the defaults", () => {
    const q = parseReportQuery({}, TODAY);
    expect(reportHref(q, {}, TODAY)).toBe("/timesheet/admin/reports");
    expect(reportHref(q, { report: "under" }, TODAY)).toBe("/timesheet/admin/reports?report=under");
    expect(reportHref(q, { from: "2026-10-01", to: "2026-10-31", employee: ID }, TODAY)).toBe(`/timesheet/admin/reports?from=2026-10-01&to=2026-10-31&employee=${ID}`);
    expect(reportHref(q, { report: "hours" }, TODAY, "/timesheet/admin/reports/export")).toBe("/timesheet/admin/reports/export");
  });
});

describe("hours report", () => {
  const logs: LogRow[] = [
    { userId: "a", name: "Asha", date: "2026-11-02", project: "Client work", hours: 6, status: "approved" },
    { userId: "a", name: "Asha", date: "2026-11-03", project: "Internal", hours: 2.5, status: "pending" },
    { userId: "b", name: "Ravi", date: "2026-11-02", project: "Client work", hours: 8, status: "approved" },
    { userId: "b", name: "Ravi", date: "2026-11-03", project: "Client work", hours: 4, status: "rejected" },
  ];
  it("by employee: leaves out rejected hours and totals", () => {
    const t = buildHoursTable(logs, "employee");
    expect(t.rows).toEqual([
      { employee: "Asha", days: 2, entries: 2, hours: 8.5, average: 4.25 }, // most hours first
      { employee: "Ravi", days: 1, entries: 1, hours: 8, average: 8 }, // his rejected 4 h don't count
    ]);
    expect(t.totals).toMatchObject({ employee: "Total", entries: 3, hours: 16.5 });
  });
  it("by project: with each project's share", () => {
    const t = buildHoursTable(logs, "project");
    expect(t.rows[0]).toEqual({ project: "Client work", people: 2, entries: 2, hours: 14, share: 84.85 });
    expect(t.rows[1]).toMatchObject({ project: "Internal", hours: 2.5 });
    expect(t.totals).toMatchObject({ hours: 16.5, share: 100 });
  });
  it("by date: oldest first", () => {
    const t = buildHoursTable(logs, "date");
    expect(t.rows.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(t.rows[0]).toMatchObject({ people: 2, hours: 14 });
  });
  it("copes with no data", () => {
    const t = buildHoursTable([], "employee");
    expect(t.rows).toEqual([]);
    expect(t.totals).toMatchObject({ hours: 0 });
  });
});

describe("under target", () => {
  it("counts only the working days that have happened: not weekends, holidays or leave, and not the future", () => {
    // 16 Nov (Mon) to 22 Nov (Sun); today is Wed 18 Nov.
    const n = expectedWorkingDays({ from: "2026-11-16", to: "2026-11-22", today: TODAY, offDays: new Set(["2026-11-17"]), leaveDays: new Set() });
    expect(n).toBe(2); // Mon and Wed; Tue is a holiday; Thu onwards hasn't happened
    expect(expectedWorkingDays({ from: "2026-11-16", to: "2026-11-22", today: TODAY, offDays: new Set(), leaveDays: new Set(["2026-11-16"]) })).toBe(2); // Tue and Wed
    expect(expectedWorkingDays({ from: "2026-10-01", to: "2026-10-31", today: TODAY, offDays: new Set(), leaveDays: new Set() })).toBe(22);
  });
  it("lists people below target, biggest shortfall first, and nobody on or above it", () => {
    const t = buildUnderTargetTable({
      people: [
        { id: "a", name: "Asha" },
        { id: "b", name: "Ravi" },
        { id: "c", name: "Meera" },
        { id: "d", name: "Dev" },
      ],
      hoursById: new Map([
        ["a", 30],
        ["b", 40],
        ["c", 12],
      ]),
      workingDaysById: new Map([
        ["a", 5],
        ["b", 5],
        ["c", 5],
        ["d", 0],
      ]),
    });
    expect(t.rows).toEqual([
      { employee: "Meera", days: 5, expected: 40, logged: 12, short: 28, percent: 30 },
      { employee: "Asha", days: 5, expected: 40, logged: 30, short: 10, percent: 75 },
    ]);
    expect(t.totals).toMatchObject({ expected: 80, logged: 42, short: 38 });
  });
});

describe("leave and comp-off", () => {
  it("counts working days taken in the range, split by kind", () => {
    const days = leaveDaysByPerson(
      [
        { userId: "a", type: "leave", compOff: false, from: "2026-11-09", to: "2026-11-13" }, // 5 working days
        { userId: "a", type: "leave", compOff: true, from: "2026-11-16", to: "2026-11-17" }, // 2 comp-off leave days
        { userId: "a", type: "wfh", compOff: false, from: "2026-11-18", to: "2026-11-18" },
        { userId: "b", type: "leave", compOff: false, from: "2026-10-28", to: "2026-11-03" }, // only Nov 2 and 3 are in range
        { userId: "c", type: "leave", compOff: false, from: "2026-11-14", to: "2026-11-15" }, // a weekend: nothing
      ],
      { from: "2026-11-01", to: "2026-11-30" },
      ["2026-11-11"] // a holiday inside Asha's leave
    );
    expect(days.get("a")).toEqual({ leave: 4, compOffLeave: 2, wfh: 1 });
    expect(days.get("b")).toEqual({ leave: 2, compOffLeave: 0, wfh: 0 });
    expect(days.has("c")).toBe(false);
  });
  it("makes the table with comp-off balances, leaving out people with nothing", () => {
    const t = buildLeaveTable({
      people: [
        { id: "a", name: "Asha" },
        { id: "b", name: "Ravi" },
        { id: "c", name: "Meera" },
      ],
      days: new Map([["a", { leave: 4, compOffLeave: 2, wfh: 1 }]]),
      compOff: new Map([["b", { earned: 2, used: 0.5, available: 1.5 }]]),
    });
    expect(t.rows.map((r) => r.employee)).toEqual(["Asha", "Ravi"]);
    expect(t.totals).toMatchObject({ leave: 4, compLeave: 2, wfh: 1, earned: 2, used: 0.5, available: 1.5 });
    expect(t.note).toMatch(/no yearly leave allowance/);
  });
});

describe("CSV export", () => {
  it("has a header, the rows and the totals, and defuses formulas", () => {
    const csv = tableToCsv({
      title: "t",
      columns: [
        { key: "name", label: "Employee" },
        { key: "hours", label: "Hours", numeric: true },
      ],
      rows: [
        { name: "Asha, R", hours: 8 },
        { name: "=HYPERLINK(1)", hours: 2.5 },
      ],
      totals: { name: "Total", hours: 10.5 },
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual(["Employee,Hours", '"Asha, R",8', "'=HYPERLINK(1),2.5", "Total,10.5", ""]);
  });
});
