import "server-only";
import ExcelJS from "exceljs";
import type { Entry } from "./model";

const HEADER_FILL = "FFFFF2A8"; // light yellow
const BORDER = { style: "thin", color: { argb: "FFBFBFBF" } } as const;

/**
 * The Work log as an Excel workbook: bold, highlighted header row that stays in view, filters, sensible column
 * widths, wrapped descriptions, and a bold total-hours row at the bottom. Text is stored as text, so a description
 * starting with "=" can never run as a formula.
 */
export async function toXlsx(entries: Entry[], withPerson: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vyntics timesheet";
  const ws = wb.addWorksheet("Work log", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    ...(withPerson ? [{ header: "Employee", key: "person", width: 22 }] : []),
    { header: "Date", key: "date", width: 13 },
    { header: "Project", key: "project", width: 16 },
    { header: "Start", key: "start", width: 9 },
    { header: "End", key: "end", width: 9 },
    { header: "Hours", key: "hours", width: 9, style: { numFmt: "0.00" } },
    { header: "Description", key: "text", width: 60, style: { alignment: { wrapText: true, vertical: "top" } } },
    { header: "Status", key: "status", width: 12 },
  ];

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  });

  for (const e of entries) {
    ws.addRow({ person: e.person, date: e.date, project: e.project, start: e.start, end: e.end, hours: e.hours ?? undefined, text: e.text, status: e.status });
  }

  const hoursCol = withPerson ? 6 : 5;
  const last = entries.length + 1;
  const hoursLetter = ws.getColumn(hoursCol).letter;
  const statusLetter = ws.getColumn(ws.columnCount).letter;
  const total = ws.addRow({});
  total.getCell(hoursCol - 1).value = "Total";
  total.getCell(hoursCol).value = {
    // Rejected entries don't count towards the total, same as on the page.
    formula: `SUMIF(${statusLetter}2:${statusLetter}${Math.max(last, 2)},"<>rejected",${hoursLetter}2:${hoursLetter}${Math.max(last, 2)})`,
    result: entries.reduce((sum, e) => sum + (e.status === "rejected" ? 0 : (e.hours ?? 0)), 0),
  };
  total.font = { bold: true };

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
