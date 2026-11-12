import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Entry } from "@/app/timesheet/(portal)/worklog/model";
import { toXlsx } from "@/app/timesheet/(portal)/worklog/xlsx";

const entry = (over: Partial<Entry>): Entry => ({
  id: "1",
  userId: "u",
  person: "Asha",
  date: "2026-11-09",
  start: "09:00",
  end: "10:30",
  hours: 1.5,
  project: "Internal",
  text: "=HYPERLINK(1)",
  status: "approved",
  noCompOff: false,
  reviewedAt: null,
  ...over,
});

describe("Excel export", () => {
  it("has a bold, highlighted, frozen header, the data, and a total that skips rejected hours", async () => {
    const buf = await toXlsx([entry({}), entry({ hours: 3, status: "rejected" })], false);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Work log")!;

    expect(ws.getRow(1).values).toEqual([undefined, "Date", "Project", "Start", "End", "Hours", "Description", "Status"]);
    const cell = ws.getCell("A1");
    expect(cell.font?.bold).toBe(true);
    expect(cell.fill).toMatchObject({ type: "pattern", fgColor: { argb: "FFFFF2A8" } });
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    expect(ws.getCell("E2").value).toBe(1.5);
    expect(ws.getCell("F2").value).toBe("=HYPERLINK(1)"); // stored as text, not a formula
    expect(ws.getCell("D4").value).toBe("Total");
    expect(ws.getCell("E4").value).toMatchObject({ result: 1.5 });
  });

  it("adds an Employee column for admins", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await toXlsx([entry({})], true)) as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Work log")!.getCell("A1").value).toBe("Employee");
  });
});
