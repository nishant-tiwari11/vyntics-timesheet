import { describe, expect, it } from "vitest";
import { cellDate, cellTime, entryKey, parseImportRows, type ImportEmployee } from "@/lib/timesheet/importModel";

const employees: ImportEmployee[] = [
  { id: "u1", name: "Diya Gupta", email: "diya.gupta@vyntics.com" },
  { id: "u2", name: "Arun Mudgal", email: "arun.mudgal@vyntics.com" },
  { id: "u3", name: "Sam Lee", email: "sam.lee@vyntics.com" },
  { id: "u4", name: "Sam Lee", email: "sam.lee2@vyntics.com" },
];
const ctx = { employees, projects: ["Client work", "Training"], today: "2026-11-20" };
const HEAD = ["Employee", "Date", "Project", "Start", "End", "Hours", "Description", "Status"];

const run = (...rows: unknown[][]) => parseImportRows([HEAD, ...rows], ctx);
const ok = (r: ReturnType<typeof run>) => {
  if ("fatal" in r) throw new Error(r.fatal);
  return r;
};

describe("cells", () => {
  it("reads dates from text, Excel numbers and date cells", () => {
    expect(cellDate("2026-11-17")).toBe("2026-11-17");
    expect(cellDate("17/11/2026")).toBe("2026-11-17");
    expect(cellDate(new Date("2026-11-17T00:00:00Z"))).toBe("2026-11-17");
    expect(cellDate(46343)).toBe("2026-11-17"); // Excel's day number for 17 Nov 2026
    expect(cellDate("2026-02-30")).toBeNull();
    expect(cellDate("hello")).toBeNull();
  });
  it("reads times from text, Excel fractions and AM/PM", () => {
    expect(cellTime("09:30")).toBe(570);
    expect(cellTime("9:30 PM")).toBe(21 * 60 + 30);
    expect(cellTime("12:00 AM")).toBe(0);
    expect(cellTime(0.375)).toBe(540); // 09:00
    expect(cellTime("25:00")).toBeNull();
    expect(cellTime("soon")).toBeNull();
  });
});

describe("parseImportRows", () => {
  it("accepts a good row, by name or by email, and fixes the project's capitals", () => {
    const r = ok(run(["Diya Gupta", "2026-11-17", "client WORK", "09:00", "11:30", 2.5, "Fixed the bug", "approved"], ["arun.mudgal@vyntics.com", "2026-11-13", "Training", "10:00", "11:00", "", "Course", ""]));
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { userId: "u1", person: "Diya Gupta", date: "2026-11-17", project: "Client work", start: "09:00", end: "11:30", text: "Fixed the bug" },
      { userId: "u2", person: "Arun Mudgal", date: "2026-11-13", project: "Training", start: "10:00", end: "11:00", text: "Course" },
    ]);
  });

  it("uses Hours from 09:00 when there are no times", () => {
    const r = ok(run(["Diya Gupta", "2026-11-17", "Training", "", "", 2, "Course"]));
    expect(r.rows[0]).toMatchObject({ start: "09:00", end: "11:00" });
  });

  it("skips blank rows and the Total row, and says why a bad row is left out", () => {
    const r = ok(
      run(
        ["Nobody", "2026-11-17", "Training", "09:00", "10:00", "", "x"],
        ["Sam Lee", "2026-11-17", "Training", "09:00", "10:00", "", "x"],
        ["Diya Gupta", "2026-11-25", "Training", "09:00", "10:00", "", "future"],
        ["Diya Gupta", "2026-11-17", "Secret", "09:00", "10:00", "", "x"],
        ["Diya Gupta", "2026-11-17", "Training", "11:00", "10:00", "", "x"],
        ["Diya Gupta", "2026-11-17", "Training", "09:00", "10:00", "", "   "],
        ["Diya Gupta", "not a date", "Training", "09:00", "10:00", "", "x"],
        [null, null, null, null, null, null, null],
        ["", "", "", "", "Total", 12, "", ""],
      ),
    );
    expect(r.rows).toEqual([]);
    expect(r.skippedEmpty).toBe(2);
    expect(r.problems.map((p) => p.message)).toEqual([
      'No employee matches "Nobody".',
      'Several employees are called "Sam Lee". Use their email instead.',
      "The date is in the future.",
      '"Secret" isn\'t an active project.',
      "The end time must be after the start time.",
      "The description is empty.",
      "The date isn't valid. Use a date such as 2026-11-17.",
    ]);
    expect(r.problems[0].row).toBe(2);
  });

  it("reports an entry that appears twice", () => {
    const row = ["Diya Gupta", "2026-11-17", "Training", "09:00", "10:00", "", "x"];
    const r = ok(run(row, row));
    expect(r.rows).toHaveLength(1);
    expect(r.problems[0].message).toMatch(/twice/);
  });

  it("refuses a sheet without the needed columns", () => {
    expect(parseImportRows([["Date", "Project"]], ctx)).toHaveProperty("fatal");
    expect(parseImportRows([], ctx)).toHaveProperty("fatal");
  });

  it("builds a key for spotting entries that already exist", () => {
    expect(entryKey({ userId: "u1", date: "2026-11-17", start: "09:00", end: "10:00", project: "Training" })).toBe("u1|2026-11-17|09:00|10:00|Training");
  });
});

describe("a real Excel file", () => {
  it("reads date cells, time cells and text cells written by Excel", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Work log");
    ws.addRow(HEAD);
    const r = ws.addRow(["Diya Gupta", new Date("2026-11-17T00:00:00Z"), "Training", 0.375, 0.5, null, "Course", null]);
    r.getCell(2).numFmt = "yyyy-mm-dd";
    r.getCell(4).numFmt = "hh:mm";
    r.getCell(5).numFmt = "hh:mm";
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const sheet = loaded.worksheets[0];
    const table: unknown[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: unknown[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).value);
      table.push(cells);
    });
    const parsed = ok(parseImportRows(table, ctx));
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ date: "2026-11-17", start: "09:00", end: "12:00", project: "Training" });
  });
});
