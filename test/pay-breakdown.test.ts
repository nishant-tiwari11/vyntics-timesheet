import { describe, expect, it } from "vitest";
import { payBreakdown } from "@/lib/payroll/breakdown";

const slip = {
  earnings: [
    { code: "basic", label: "Basic", amount: 3_000_000 },
    { code: "hra", label: "HRA", amount: 1_000_000 },
    { code: "overtime", label: "Overtime", amount: 50_000 },
    { code: "bonus", label: "Diwali", amount: 500_000 },
  ],
  gross: 4_550_000,
  totalDeductions: 400_000,
  reimbursement: 120_000,
  roundingAdjustment: 0,
  net: 4_270_000,
};

describe("payBreakdown", () => {
  it("splits base, bonus, other earnings and expenses", () => {
    const b = payBreakdown(slip);
    expect(b).toMatchObject({ base: 4_000_000, bonus: 500_000, otherEarnings: 50_000, expenses: 120_000, deductions: 400_000, total: 4_270_000 });
  });
  it("adds up to the total", () => {
    const b = payBreakdown(slip);
    expect(b.base + b.bonus + b.otherEarnings - b.deductions + b.expenses + b.rounding).toBe(b.total);
  });
  it("has no bonus or expenses when there are none", () => {
    const b = payBreakdown({ ...slip, earnings: slip.earnings.slice(0, 2), gross: 4_000_000, reimbursement: 0, net: 3_600_000 });
    expect(b.bonus).toBe(0);
    expect(b.expenses).toBe(0);
    expect(b.otherEarnings).toBe(0);
  });
});
