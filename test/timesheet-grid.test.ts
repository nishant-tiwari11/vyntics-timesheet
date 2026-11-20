import { describe, expect, it } from "vitest";
import { buildRows, fmtMinutes, parseDuration, planAddEntry, planSave } from "@/app/timesheet/(portal)/worklog/timesheet/gridModel";
import { parseQuickAdd } from "@/app/timesheet/(portal)/worklog/timesheet/quickAdd";
import type { Entry } from "@/app/timesheet/(portal)/worklog/model";

// 2026-11-17 is a Tuesday.
const TODAY = "2026-11-17";

const entry = (over: Partial<Entry>): Entry => ({
  id: "e1",
  userId: "me",
  person: "Me",
  date: TODAY,
  start: "09:00",
  end: "11:00",
  hours: 2,
  project: "Client work",
  text: "Did things",
  status: "pending",
  noCompOff: false,
  reviewedAt: null,
  ...over,
});

describe("parseDuration", () => {
  it("accepts HH:MM and decimal hours", () => {
    expect(parseDuration("5:30")).toBe(330);
    expect(parseDuration("5.5")).toBe(330);
    expect(parseDuration("5,5")).toBe(330);
    expect(parseDuration("8")).toBe(480);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("")).toBe(0);
  });
  it("rejects nonsense and anything longer than a day", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("5:75")).toBeNull();
    expect(parseDuration("25")).toBeNull();
    expect(parseDuration("-1")).toBeNull();
  });
  it("formats minutes as H:MM", () => {
    expect(fmtMinutes(330)).toBe("5:30");
    expect(fmtMinutes(0)).toBe("0:00");
  });
});

describe("buildRows", () => {
  const days = ["2026-11-16", "2026-11-17", "2026-11-18"];
  it("makes a row per project that has entries, counting only my own non-rejected entries", () => {
    const rows = buildRows({
      entries: [entry({}), entry({ id: "e2", userId: "other" }), entry({ id: "e3", project: "Internal", status: "rejected" })],
      myId: "me",
      days,
      today: TODAY,
    });
    expect(rows.map((r) => r.project)).toEqual(["Client work", "Internal"]);
    expect(rows[0].cells[1].minutes).toBe(120);
    expect(rows[1].cells[1].minutes).toBe(0);
  });
  it("marks future days, old days, approved and multi-entry cells as not editable", () => {
    const rows = buildRows({
      entries: [entry({}), entry({ id: "e2", date: "2026-11-16", status: "approved" }), entry({ id: "e3", date: "2026-11-16", project: "Internal" }), entry({ id: "e4", date: "2026-11-16", project: "Internal" })],
      myId: "me",
      days,
      today: TODAY,
    });
    const client = rows.find((r) => r.project === "Client work")!;
    expect(client.cells.map((c) => c.state)).toEqual(["locked", "editable", "future"]);
    expect(rows.find((r) => r.project === "Internal")!.cells[0].state).toBe("multi");
    const old = buildRows({ entries: [entry({ date: "2026-11-02" })], myId: "me", days: ["2026-11-02"], today: TODAY });
    expect(old[0].cells[0].state).toBe("locked");
    expect(old[0].locked).toBe(true);
    expect(client.locked).toBe(false);
  });
  it("adds projects chosen by hand as empty rows", () => {
    const rows = buildRows({ entries: [], myId: "me", days, today: TODAY, extra: ["Training"] });
    expect(rows.map((r) => r.project)).toEqual(["Training"]);
  });
});

describe("planSave", () => {
  const empty = buildRows({ entries: [], myId: "me", days: [TODAY], today: TODAY, extra: ["Internal"] })[0].cells[0];
  const filled = buildRows({ entries: [entry({})], myId: "me", days: [TODAY], today: TODAY })[0].cells[0];

  it("adds a new entry at 09:00 when the day is empty", () => {
    const plan = planSave(empty, 330, "Internal", []);
    expect(plan).toMatchObject({ kind: "add", input: { start: "09:00", end: "14:30", project: "Internal", date: TODAY } });
  });
  it("places a new entry after the day's other entries", () => {
    const plan = planSave(empty, 60, "Internal", [{ end: "13:00" }, { end: "11:00" }]);
    expect(plan).toMatchObject({ kind: "add", input: { start: "13:00", end: "14:00" } });
  });
  it("keeps an entry inside the day", () => {
    const plan = planSave(empty, 600, "Internal", [{ end: "20:00" }]);
    expect(plan).toMatchObject({ kind: "add", input: { start: "13:59", end: "23:59" } });
  });
  it("changes only the end of an existing entry and keeps its text", () => {
    const plan = planSave(filled, 300, "Client work", []);
    expect(plan).toEqual({
      kind: "update",
      id: "e1",
      input: { date: TODAY, text: "Did things", start: "09:00", end: "14:00", project: "Client work" },
    });
  });
  it("deletes on zero, and ignores no-ops and cells that can't change", () => {
    expect(planSave(filled, 0, "Client work", [])).toEqual({ kind: "delete", id: "e1" });
    expect(planSave(empty, 0, "Internal", [])).toEqual({ kind: "none" });
    expect(planSave(filled, 120, "Client work", [])).toEqual({ kind: "none" });
    const future = buildRows({ entries: [], myId: "me", days: ["2026-11-20"], today: TODAY, extra: ["Internal"] })[0].cells[0];
    expect(planSave(future, 60, "Internal", [])).toEqual({ kind: "none" });
  });
});

describe("parseQuickAdd", () => {
  it("reads hours and a weekday (the latest one on or before today)", () => {
    expect(parseQuickAdd("Log 8 hours for Friday", TODAY)).toEqual({ minutes: 480, date: "2026-11-13", project: null });
    expect(parseQuickAdd("log 2.5 hrs yesterday", TODAY)).toMatchObject({ minutes: 150, date: "2026-11-16" });
    expect(parseQuickAdd("4h on tuesday", TODAY)).toMatchObject({ minutes: 240, date: TODAY });
  });
  it("reads H:MM, minutes, today and a project name", () => {
    expect(parseQuickAdd("1:30 training today", TODAY)).toEqual({ minutes: 90, date: TODAY, project: "Training" });
    expect(parseQuickAdd("45 min meetings", TODAY)).toMatchObject({ minutes: 45, date: null, project: "Meetings" });
  });
  it("leaves out what it can't find", () => {
    expect(parseQuickAdd("hello", TODAY)).toEqual({ minutes: null, date: null, project: null });
    expect(parseQuickAdd("log 30 hours", TODAY).minutes).toBeNull();
  });
});

describe("planAddEntry", () => {
  it("adds a described entry at 09:00 when the day is empty", () => {
    expect(planAddEntry("2026-11-17", 150, "Client work", "  fixed the login bug ", [])).toEqual({
      date: "2026-11-17",
      text: "fixed the login bug",
      start: "09:00",
      end: "11:30",
      project: "Client work",
    });
  });
  it("starts after what is already logged that day", () => {
    expect(planAddEntry("2026-11-17", 60, "Client work", "more work", [{ end: "12:30" }])?.start).toBe("12:30");
  });
  it("refuses a missing description or a bad length", () => {
    expect(planAddEntry("2026-11-17", 60, "Client work", "   ", [])).toBeNull();
    expect(planAddEntry("2026-11-17", 0, "Client work", "x", [])).toBeNull();
    expect(planAddEntry("2026-11-17", 24 * 60, "Client work", "x", [])).toBeNull();
  });
});
