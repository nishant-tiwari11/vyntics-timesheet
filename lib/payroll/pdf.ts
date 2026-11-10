import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toRupeeText } from "./money";
import type { PayslipDetail, SlipLine } from "./slipTypes";

// Payslip PDFs are built from the STORED snapshot, so an old payslip always downloads exactly as it was finalized.
// Black and white only. The standard PDF fonts can't draw every character, so anything outside Latin-1 becomes "?", and
// amounts are written with the currency code ("INR 12,345.67") because the rupee sign isn't in those fonts.

const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?").replace(/ /g, " ");

function money(paise: number, currency: string): string {
  const n = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(toRupeeText(Math.abs(paise))));
  return `${paise < 0 ? "-" : ""}${currency} ${n}`;
}

const monthLabel = (month: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
const dayLabel = (ymd: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

const W = 595;
const H = 842;
const M = 48;

function fit(font: PDFFont, text: string, size: number, max: number): string {
  let t = safe(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1);
  return t;
}

function drawSlip(doc: PDFDocument, slip: PayslipDetail, fonts: { regular: PDFFont; bold: PDFFont }) {
  const page: PDFPage = doc.addPage([W, H]);
  const { regular, bold } = fonts;
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  let y = H - M;

  const text = (t: string, x: number, size = 10, font = regular, color = black) => page.drawText(safe(t), { x, y, size, font, color });
  const right = (t: string, xRight: number, size = 10, font = regular) => page.drawText(safe(t), { x: xRight - font.widthOfTextAtSize(safe(t), size), y, size, font, color: black });
  const rule = (gap = 10) => {
    y -= gap;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: black });
    y -= 14;
  };

  text("Vyntics Employee Management System", M, 10, regular, gray);
  y -= 24;
  text(`Payslip, ${monthLabel(slip.month)}`, M, 20, bold);
  y -= 8;
  rule();

  text(slip.employee.name, M, 12, bold);
  y -= 15;
  text(slip.employee.email, M, 9, regular, gray);
  y -= 13;
  if (slip.employee.department) {
    text(`Department: ${slip.employee.department}`, M, 9, regular, gray);
    y -= 13;
  }
  text(`Pay period: ${dayLabel(slip.periodStart)} to ${dayLabel(slip.periodEnd)}`, M, 9, regular, gray);
  y -= 13;
  text(`Status: ${slip.status === "paid" ? `Paid${slip.paidOn ? ` on ${dayLabel(slip.paidOn)}` : ""}` : "Finalized"}`, M, 9, regular, gray);
  rule(6);

  // Earnings on the left, deductions on the right.
  const colW = (W - 2 * M - 24) / 2;
  const leftX = M;
  const rightX = M + colW + 24;
  const startY = y;
  const column = (title: string, lines: SlipLine[], x: number) => {
    let yy = startY;
    page.drawText(title, { x, y: yy, size: 11, font: bold, color: black });
    yy -= 18;
    if (lines.length === 0) {
      page.drawText("None", { x, y: yy, size: 10, font: regular, color: gray });
      yy -= 15;
    }
    for (const l of lines) {
      const amount = money(l.amount, slip.currency);
      const label = fit(regular, l.label, 10, colW - regular.widthOfTextAtSize(amount, 10) - 12);
      page.drawText(label, { x, y: yy, size: 10, font: regular, color: black });
      page.drawText(amount, { x: x + colW - regular.widthOfTextAtSize(amount, 10), y: yy, size: 10, font: regular, color: black });
      yy -= 15;
    }
    return yy;
  };
  y = Math.min(column("Earnings", slip.earnings, leftX), column("Deductions", slip.deductionLines, rightX));
  rule(2);

  text("Gross pay", M, 10);
  right(money(slip.gross, slip.currency), W - M);
  y -= 15;
  text("Total deductions", M, 10);
  right(money(slip.deductions, slip.currency), W - M);
  y -= 15;
  if (slip.roundingAdjustment !== 0) {
    text("Rounding", M, 10);
    right(money(slip.roundingAdjustment, slip.currency), W - M);
    y -= 15;
  }
  text("Net pay", M, 13, bold);
  right(money(slip.net, slip.currency), W - M, 13, bold);
  rule(6);

  text("Attendance summary", M, 11, bold);
  y -= 18;
  const a = slip.attendance;
  const rows: [string, string][] = [
    ["Days the pay is based on", String(a.baseDays)],
    ["Working days", String(a.workingDays)],
    ["Present days", String(a.presentDays)],
    ["Work from home days", String(a.wfhDays)],
    ["Paid leave days", String(a.paidLeaveDays)],
    ["Comp-off leave days", String(a.compOffLeaveDays)],
    ["Loss of pay days", String(a.lopDays)],
    ["Absent days", String(a.absentDays)],
    ["Holidays or week-offs worked", String(a.holidayWorkedDays)],
    ["Comp-off earned (days off worked)", String(a.compOffEarnedDays)],
    ["Payable days", String(slip.payableDays)],
  ];
  for (const [label, value] of rows) {
    text(label, M, 10);
    right(value, W - M);
    y -= 14;
  }

  page.drawText("Computer-generated from the stored payslip. It needs no signature.", { x: M, y: M - 8, size: 8, font: regular, color: gray });
}

/** One PDF with one page per payslip. */
export async function buildPayslipsPdf(slips: PayslipDetail[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(title));
  doc.setProducer("Vyntics Employee Management System");
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  for (const s of slips) drawSlip(doc, s, fonts);
  return doc.save();
}
