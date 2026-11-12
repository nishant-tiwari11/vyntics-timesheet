import { describe, expect, it } from "vitest";
import { clock12, csvCell, daysLeftToEdit, editHint, filterEntries, fmtDuration, groupByDay, paginate, summarize, toCsv, type Entry } from "@/app/timesheet/(portal)/worklog/model";
import { parseWorkQuery, periodLabel, periodOf, shiftedDate, workHref } from "@/app/timesheet/(portal)/worklog/query";

const TODAY = "2026-11-12"; // a Thursday

const e = (over: Partial<Entry>): Entry => ({
  id: Math.random().toString(36).slice(2),
  userId: "me",
  person: "Me",
  date: TODAY,
  start: "09:00",
  end: "10:00",
  hours: 1,
  project: "Internal",
  text: "work",
  status: "pending",
  noCompOff: false,
  reviewedAt: null,
  ...over,
});

const q = (raw: Record<string, string> = {}) => parseWorkQuery(raw, TODAY);

describe("periods", () => {
  it("shows Monday to Sunday for a week, the whole month for a month, one day for a day", () => {
    expect(periodOf(q(), TODAY)).toEqual({ from: "2026-11-09", to: "2026-11-15", custom: false });
    expect(periodOf(q({ view: "month" }), TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30", custom: false });
    expect(periodOf(q({ view: "day", date: "2026-11-03" }), TODAY)).toEqual({ from: "2026-11-03", to: "2026-11-03", custom: false });
  });

  it("steps back and forward by the right amount, across month and year ends", () => {
    expect(shiftedDate(q({ view: "week" }), -1)).toBe("2026-11-02");
    expect(shiftedDate(q({ view: "day", date: "2026-03-01" }), -1)).toBe("2026-02-28");
    expect(shiftedDate(q({ view: "month", date: "2026-01-20" }), -1)).toBe("2025-12-01");
    expect(shiftedDate(q({ view: "month", date: "2026-12-05" }), 1)).toBe("2027-01-01");
  });

  it("a custom range replaces the period, is put in order, and is capped at a year", () => {
    expect(periodOf(q({ from: "2026-11-05", to: "2026-11-02" }), TODAY)).toEqual({ from: "2026-11-02", to: "2026-11-05", custom: true });
    const long = periodOf(q({ from: "2020-01-01", to: "2026-11-12" }), TODAY);
    expect(long.from).toBe("2025-11-12");
  });

  it("labels each view", () => {
    expect(periodLabel(q({ view: "month" }), TODAY)).toBe("November 2026");
    expect(periodLabel(q({ view: "day" }), TODAY)).toContain("12 November 2026");
  });
});

describe("the address", () => {
  it("falls back to defaults for anything odd", () => {
    const query = q({ view: "year", status: "x", project: "Nope", sort: "zzz", page: "-3", size: "7", date: "nonsense", from: "2026-13-40" });
    expect(query).toMatchObject({ view: "week", status: "all", project: "all", sort: "date", page: 1, size: 25, date: TODAY, from: "" });
  });

  it("leaves defaults out and round-trips the rest", () => {
    expect(workHref(q(), {}, TODAY)).toBe("/timesheet/worklog");
    const href = workHref(q(), { view: "month", project: "Meetings", q: "bug", sort: "duration", dir: "asc", page: 2 }, TODAY);
    expect(href).toBe("/timesheet/worklog?view=month&project=Meetings&q=bug&sort=duration&dir=asc&page=2");
    const back = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(q(back)).toMatchObject({ view: "month", project: "Meetings", q: "bug", sort: "duration", dir: "asc", page: 2 });
  });
});

describe("filtering, grouping and pages", () => {
  const list = [
    e({ id: "a", date: "2026-11-12", start: "14:00", end: "15:00", project: "Meetings", text: "Sprint planning" }),
    e({ id: "b", date: "2026-11-12", start: "09:00", end: "11:00", hours: 2, project: "Client work", text: "Invoice bug", status: "approved" }),
    e({ id: "c", date: "2026-11-10", hours: 3, project: "Client work", text: "Report", status: "rejected" }),
  ];

  it("filters by project, status and search (text, project or person)", () => {
    expect(filterEntries(list, { project: "Client work", status: "all", q: "" }).map((x) => x.id)).toEqual(["b", "c"]);
    expect(filterEntries(list, { project: "all", status: "approved", q: "" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterEntries(list, { project: "all", status: "all", q: "PLANNING" }).map((x) => x.id)).toEqual(["a"]);
  });

  it("groups by day, newest first, entries by start time, and totals skip rejected hours", () => {
    const groups = groupByDay(list, { sort: "date", dir: "desc" });
    expect(groups.map((g) => g.date)).toEqual(["2026-11-12", "2026-11-10"]);
    expect(groups[0].entries.map((x) => x.id)).toEqual(["b", "a"]);
    expect(groups[0].total).toBe(3);
    expect(groups[1].total).toBe(0); // the only entry is rejected
  });

  it("other sorts order the entries inside each day and keep days newest first", () => {
    const groups = groupByDay(list, { sort: "duration", dir: "desc" });
    expect(groups.map((g) => g.date)).toEqual(["2026-11-12", "2026-11-10"]);
    expect(groups[0].entries.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("adds working days with no entry as empty groups", () => {
    const groups = groupByDay(list, { sort: "date", dir: "asc" }, ["2026-11-11"]);
    expect(groups.map((g) => [g.date, g.missing])).toEqual([
      ["2026-11-10", false],
      ["2026-11-11", true],
      ["2026-11-12", false],
    ]);
  });

  it("pages by rows, repeating a day's heading when it runs over", () => {
    const groups = groupByDay(list, { sort: "date", dir: "desc" });
    const first = paginate(groups, 1, 1);
    const second = paginate(groups, 2, 1);
    expect(first).toMatchObject({ total: 3, last: 3, from: 1, to: 1 });
    expect(first.groups[0].shown.map((x) => x.id)).toEqual(["b"]);
    expect(second.groups[0].shown.map((x) => x.id)).toEqual(["a"]);
    expect(second.groups[0].continued).toBe(true);
    expect(paginate(groups, 99, 25).page).toBe(1);
  });
});

describe("summary and the edit window", () => {
  it("counts working days, hours, target, missing days and ignores weekends, holidays and leave", () => {
    const s = summarize({
      mine: [e({ date: "2026-11-09", hours: 8 }), e({ date: "2026-11-10", hours: 4 }), e({ date: "2026-11-10", hours: 5, status: "rejected" })],
      from: "2026-11-09",
      to: "2026-11-15",
      today: TODAY,
      offDays: ["2026-11-11"],
      leaveDays: ["2026-11-13"],
      pendingApprovals: 2,
    });
    expect(s.workingDays).toBe(3); // Mon, Tue, Thu (Wed holiday, Fri leave, weekend)
    expect(s.total).toBe(12);
    expect(s.target).toBe(24);
    expect(s.remaining).toBe(12);
    expect(s.missingDays).toEqual(["2026-11-12"]);
    expect(s.pendingApprovals).toBe(2);
  });

  it("counts days left to edit: an entry for day D can be changed until D + 7", () => {
    expect(daysLeftToEdit({ date: "2026-11-12", status: "pending" }, TODAY)).toBe(7);
    expect(daysLeftToEdit({ date: "2026-11-05", status: "pending" }, TODAY)).toBe(0);
    expect(daysLeftToEdit({ date: "2026-11-04", status: "pending" }, TODAY)).toBeNull(); // locked
    expect(daysLeftToEdit({ date: "2026-11-12", status: "approved" }, TODAY)).toBeNull();
    expect(editHint(0)).toBe("Last day to edit");
    expect(editHint(1)).toBe("1 day left to edit");
  });
});

describe("formatting and CSV", () => {
  it("formats times and durations", () => {
    expect(clock12("14:30")).toBe("2:30 PM");
    expect(clock12("00:05")).toBe("12:05 AM");
    expect(fmtDuration(2.5)).toBe("2 h 30 min");
    expect(fmtDuration(0.75)).toBe("45 min");
    expect(fmtDuration(null)).toBe("—");
  });

  it("quotes cells and defuses spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(2.5)).toBe("2.5");
  });

  it("writes a header and one line per entry, with the employee column only when asked", () => {
    const rows = [e({ text: "a\nb", person: "Asha" })];
    const own = toCsv(rows, false).replace("﻿", "").split("\r\n");
    expect(own[0]).toBe("Date,Project,Start,End,Hours,Description,Status");
    expect(own[1]).toBe('2026-11-12,Internal,09:00,10:00,1,"a\nb",pending');
    expect(toCsv(rows, true)).toContain("Employee,Date");
  });
});
