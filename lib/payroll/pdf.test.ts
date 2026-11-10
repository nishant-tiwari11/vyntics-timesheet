import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPayslipsPdf } from "./pdf";
import type { PayslipDetail } from "./slipTypes";

const slip: PayslipDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  month: "2026-11",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  status: "paid",
  paidOn: "2026-12-01",
  gross: 4800000,
  deductions: 380000,
  net: 4420000,
  payableDays: 30,
  lopDays: 0,
  currency: "INR",
  employee: { name: "Asha Verma ₹ ✓", email: "asha@vyntics.com", department: "Engineering" },
  earnings: [
    { code: "basic", label: "Basic", amount: 3000000 },
    { code: "hra", label: "HRA", amount: 1200000 },
    { code: "allowances", label: "Other allowances", amount: 600000 },
  ],
  deductionLines: [
    { code: "pf", label: "Provident fund", amount: 360000 },
    { code: "professional_tax", label: "Professional tax", amount: 20000 },
  ],
  roundingAdjustment: 0,
  attendance: { baseDays: 30, workingDays: 21, presentDays: 21, wfhDays: 2, paidLeaveDays: 0, compOffLeaveDays: 0, lopDays: 0, absentDays: 0, holidayWorkedDays: 1, compOffEarnedDays: 1, overtimeHours: 0 },
};

describe("payslip PDF", () => {
  it("builds a real PDF with one page per payslip", async () => {
    const bytes = await buildPayslipsPdf([slip, { ...slip, month: "2026-12" }], "Payslips");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(2);
  });

  it("does not fail on characters the standard fonts can't draw", async () => {
    await expect(buildPayslipsPdf([{ ...slip, employee: { ...slip.employee, name: "名前 ₹ ✓ Zoë" } }], "x")).resolves.toBeInstanceOf(Uint8Array);
  });
});
