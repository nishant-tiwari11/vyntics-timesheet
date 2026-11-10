import { describe, expect, it } from "vitest";
import { computePayslip, type Adjustment, type Component, type DayFact, type EngineInput, type PayrollSettings } from "./engine";
import { formatMoney, mulDivRound, parseMoney, percentOf, proRate, toRupeeText } from "./money";

// November 2026: 30 days. Saturdays and Sundays are weekly offs (1, 7, 8, 14, 15, 21, 22, 28, 29), so there are 21 working days.
const START = "2026-11-01";
const END = "2026-11-30";

const settings: PayrollSettings = {
  payBasis: "calendar_days",
  holidayWorkMode: "comp_off",
  overtimeEnabled: false,
  overtimeRateBp: 15000,
  holidayWorkRateBp: 20000,
  standardHundredths: 800,
  overtimeBase: "basic",
  paidLeavePerMonth: 0,
  roundNetToRupee: false,
};

const rupees = (n: number) => n * 100;
const structure = { basic: rupees(30000), hra: rupees(12000), allowances: rupees(6000), deductions: 0 };

type DayOverrides = Partial<Record<string, Partial<DayFact>>>;

function addDay(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Every day of the month. Working days are present for 8 hours unless overridden. */
function month(overrides: DayOverrides = {}, holidays: string[] = []): DayFact[] {
  const out: DayFact[] = [];
  for (let d = START; d <= END; d = addDay(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const weekOff = dow === 0 || dow === 6;
    const holiday = holidays.includes(d);
    out.push({
      date: d,
      weekOff,
      holiday,
      leave: false,
      compOffLeave: false,
      wfh: false,
      hoursHundredths: weekOff || holiday ? 0 : 800,
      compOffEarned: false,
      compOffPending: false,
      ...overrides[d],
    });
  }
  return out;
}

function run(over: Partial<EngineInput> = {}, setOver: Partial<PayrollSettings> = {}) {
  return computePayslip({
    period: { start: START, end: END },
    settings: { ...settings, ...setOver },
    structure,
    components: [],
    employment: { joinedOn: "2020-01-01", leftOn: null },
    days: month(),
    adjustments: [],
    ...over,
  });
}

const line = (lines: { code: string; amount: number }[], code: string) => lines.find((l) => l.code === code)?.amount;

describe("money", () => {
  it("reads rupees into paise without floating point", () => {
    expect(parseMoney("12,345.67")).toBe(1234567);
    expect(parseMoney("₹ 500")).toBe(50000);
    expect(parseMoney("0.5")).toBe(50);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("writes paise back as rupees", () => {
    expect(toRupeeText(1234567)).toBe("12345.67");
    expect(toRupeeText(5)).toBe("0.05");
    expect(formatMoney(1234567)).toContain("12,345.67");
  });

  it("rounds half up and never overflows", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1); // 0.5 -> 1
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(2, 1, 3)).toBe(1);
    expect(mulDivRound(-1, 1, 2)).toBe(-1); // away from zero
    expect(mulDivRound(10_000_000_000_000, 99_999, 3)).toBe(333_330_000_000_000_000); // 3.3e17: far past 2^53 if multiplied as plain numbers is still exact here
    expect(percentOf(rupees(5000), 1200)).toBe(rupees(600));
    expect(proRate(100001, 29, 30)).toBe(96668); // 96667.633... -> 96668
    expect(() => mulDivRound(1, 1, 0)).toThrow();
  });
});

describe("a full month", () => {
  it("pays the whole salary when nothing is missed", () => {
    const p = run();
    expect(p.periodDays).toBe(30);
    expect(p.payableDays).toBe(30);
    expect(p.lopDays).toBe(0);
    expect(p.absentDays).toBe(0);
    expect(p.gross).toBe(rupees(48000));
    expect(p.net).toBe(rupees(48000));
  });

  it("pays holidays and week-offs", () => {
    const p = run({ days: month({}, ["2026-11-09", "2026-11-10"]) });
    expect(p.workingDaysInPeriod).toBe(19);
    expect(p.payableDays).toBe(30);
    expect(p.gross).toBe(rupees(48000));
  });
});

describe("loss of pay", () => {
  it("takes unpaid leave off the payable days", () => {
    const p = run({ days: month({ "2026-11-03": { leave: true, hoursHundredths: 0 }, "2026-11-04": { leave: true, hoursHundredths: 0 } }) });
    expect(p.lopDays).toBe(2);
    expect(p.payableDays).toBe(28);
    expect(line(p.earnings, "basic")).toBe(proRate(rupees(30000), 28, 30)); // 28,000.00
    expect(line(p.earnings, "basic")).toBe(rupees(28000));
  });

  it("lets the paid leave allowance cover the first days only", () => {
    const leave = { leave: true, hoursHundredths: 0 };
    const p = run({ days: month({ "2026-11-03": leave, "2026-11-04": leave, "2026-11-05": leave }) }, { paidLeavePerMonth: 1 });
    expect(p.paidLeaveDays).toBe(1);
    expect(p.lopDays).toBe(2);
    expect(p.payableDays).toBe(28);
  });

  it("counts a working day with no hours, no leave and no WFH as absent", () => {
    const p = run({ days: month({ "2026-11-10": { hoursHundredths: 0 } }) });
    expect(p.absentDays).toBe(1);
    expect(p.payableDays).toBe(29);
  });

  it("does not call a work-from-home day absent, even without hours", () => {
    const p = run({ days: month({ "2026-11-10": { hoursHundredths: 0, wfh: true } }) });
    expect(p.absentDays).toBe(0);
  });

  it("adds manual loss-of-pay days", () => {
    const p = run({ manualLopDays: 3 });
    expect(p.lopDays).toBe(3);
    expect(p.payableDays).toBe(27);
  });

  it("ignores leave that falls on a weekend or holiday", () => {
    const p = run({ days: month({ "2026-11-14": { leave: true }, "2026-11-09": { leave: true, hoursHundredths: 0 } }, ["2026-11-09"]) });
    expect(p.lopDays).toBe(0);
  });
});

describe("comp-off", () => {
  it("pays a comp-off leave day, with no loss of pay", () => {
    const p = run({ days: month({ "2026-11-12": { compOffLeave: true, hoursHundredths: 0 } }) });
    expect(p.compOffLeaveDays).toBe(1);
    expect(p.lopDays).toBe(0);
    expect(p.absentDays).toBe(0);
    expect(p.payableDays).toBe(30);
  });

  it("does not pay holiday work when the company gives comp-off", () => {
    const p = run({ days: month({ "2026-11-14": { hoursHundredths: 800, compOffEarned: true } }) });
    expect(line(p.earnings, "holiday_work")).toBeUndefined();
    expect(p.holidayWorkHours).toBe(8);
  });

  it("pays holiday work when the setting is Pay", () => {
    const p = run({ days: month({ "2026-11-14": { hoursHundredths: 800 } }) }, { holidayWorkMode: "pay" });
    // base 30,000 / (21 days * 8 h) * 8 h * 2.0 = 30,000 / 21 * 2 = 2,857.14
    expect(line(p.earnings, "holiday_work")).toBe(285714);
  });

  it("never pays a day that already earned comp-off, even in Pay mode", () => {
    const p = run({ days: month({ "2026-11-14": { hoursHundredths: 800, compOffEarned: true } }) }, { holidayWorkMode: "pay" });
    expect(line(p.earnings, "holiday_work")).toBeUndefined();
    expect(p.warnings.join(" ")).toContain("not paid again");
  });

  it("warns when a comp-off request is pending on a day being paid", () => {
    const p = run({ days: month({ "2026-11-14": { hoursHundredths: 800, compOffPending: true } }) }, { holidayWorkMode: "pay" });
    expect(p.warnings.join(" ")).toContain("pending");
  });
});

describe("overtime", () => {
  it("pays hours beyond the standard day at the overtime rate", () => {
    const p = run({ days: month({ "2026-11-03": { hoursHundredths: 1000 }, "2026-11-04": { hoursHundredths: 950 } }) }, { overtimeEnabled: true });
    expect(p.overtimeHours).toBe(3.5);
    // 30,000 / (21 * 8) * 3.5 * 1.5 = 937.50
    expect(line(p.earnings, "overtime")).toBe(93750);
  });

  it("pays nothing when overtime is off", () => {
    const p = run({ days: month({ "2026-11-03": { hoursHundredths: 1200 } }) });
    expect(line(p.earnings, "overtime")).toBeUndefined();
  });

  it("can use gross as the base", () => {
    const p = run({ days: month({ "2026-11-03": { hoursHundredths: 1000 } }) }, { overtimeEnabled: true, overtimeBase: "gross" });
    // 48,000 / 168 * 2 * 1.5 = 857.14
    expect(line(p.earnings, "overtime")).toBe(85714);
  });
});

describe("pro-rata for joiners and leavers", () => {
  it("pays from the joining date", () => {
    const p = run({ employment: { joinedOn: "2026-11-16", leftOn: null }, days: month() });
    expect(p.employedDays).toBe(15);
    expect(p.payableDays).toBe(15);
    expect(p.gross).toBe(rupees(24000));
  });

  it("pays up to the leaving date", () => {
    const p = run({ employment: { joinedOn: "2020-01-01", leftOn: "2026-11-10" } });
    expect(p.employedDays).toBe(10);
    expect(p.gross).toBe(rupees(16000));
  });

  it("does not mark days before joining as absent", () => {
    const days = month({ "2026-11-02": { hoursHundredths: 0 } });
    const p = run({ employment: { joinedOn: "2026-11-16", leftOn: null }, days });
    expect(p.absentDays).toBe(0);
  });

  it("pays nothing, with a warning, if never employed this month", () => {
    const p = run({ employment: { joinedOn: "2027-01-01", leftOn: null } });
    expect(p.gross).toBe(0);
    expect(p.warnings.join(" ")).toContain("not employed");
  });
});

describe("pay basis", () => {
  it("divides by working days when asked", () => {
    const leave = { leave: true, hoursHundredths: 0 };
    const p = run({ days: month({ "2026-11-03": leave }) }, { payBasis: "working_days" });
    expect(p.baseDays).toBe(21);
    expect(p.payableDays).toBe(20);
    expect(line(p.earnings, "basic")).toBe(proRate(rupees(30000), 20, 21));
  });
});

describe("components and adjustments", () => {
  const pf: Component = { code: "pf", name: "Provident fund", kind: "deduction", calc: "percent", amount: 0, percentBp: 1200, percentOf: "basic", enabled: true };
  const tax: Component = { code: "professional_tax", name: "Professional tax", kind: "deduction", calc: "fixed", amount: rupees(200), percentBp: 0, percentOf: "basic", enabled: true };
  const esi: Component = { code: "esi", name: "ESI", kind: "deduction", calc: "percent", amount: 0, percentBp: 75, percentOf: "gross", enabled: false };
  const bonus: Component = { code: "meal", name: "Meal card", kind: "earning", calc: "fixed", amount: rupees(2000), percentBp: 0, percentOf: "basic", enabled: true };

  it("applies enabled components and skips disabled ones", () => {
    const p = run({ components: [pf, tax, esi] });
    expect(line(p.deductions, "pf")).toBe(rupees(3600)); // 12% of 30,000
    expect(line(p.deductions, "professional_tax")).toBe(rupees(200));
    expect(line(p.deductions, "esi")).toBeUndefined();
    expect(p.net).toBe(rupees(48000) - rupees(3800));
  });

  it("takes percentages of the pro-rated basic", () => {
    const p = run({ components: [pf], manualLopDays: 3 });
    expect(line(p.deductions, "pf")).toBe(percentOf(proRate(rupees(30000), 27, 30), 1200));
  });

  it("pro-rates fixed earnings but not fixed deductions", () => {
    const p = run({ components: [bonus, tax], manualLopDays: 15 });
    expect(line(p.earnings, "meal")).toBe(rupees(1000));
    expect(line(p.deductions, "professional_tax")).toBe(rupees(200));
  });

  it("adds bonuses, arrears, reimbursements and one-off deductions", () => {
    const adjustments: Adjustment[] = [
      { kind: "bonus", label: "Festival bonus", amount: rupees(5000) },
      { kind: "arrears", label: "Arrears", amount: rupees(1500) },
      { kind: "reimbursement", label: "Travel", amount: rupees(800) },
      { kind: "deduction", label: "Advance", amount: rupees(2000) },
    ];
    const p = run({ adjustments });
    expect(p.gross).toBe(rupees(48000 + 5000 + 1500 + 800));
    expect(p.totalDeductions).toBe(rupees(2000));
    expect(p.net).toBe(rupees(48000 + 5000 + 1500 + 800 - 2000));
  });

  it("includes the structure's fixed deductions in full", () => {
    const p = run({ structure: { ...structure, deductions: rupees(1000) }, manualLopDays: 15 });
    expect(line(p.deductions, "fixed_deductions")).toBe(rupees(1000));
  });

  it("warns about a negative net", () => {
    const p = run({ adjustments: [{ kind: "deduction", label: "Recovery", amount: rupees(60000) }] });
    expect(p.net).toBeLessThan(0);
    expect(p.warnings.join(" ")).toContain("negative");
  });
});

describe("rounding", () => {
  it("rounds each line half up to the paise, and the lines add up exactly", () => {
    const odd = { basic: 100001, hra: 33333, allowances: 777, deductions: 0 }; // awkward numbers
    const p = run({ structure: odd, manualLopDays: 1 });
    const lines = p.earnings.reduce((n, l) => n + l.amount, 0);
    expect(p.gross).toBe(lines);
    expect(line(p.earnings, "basic")).toBe(96668);
    expect(line(p.earnings, "hra")).toBe(32222); // 33333 * 29 / 30 = 32222.1
    expect(line(p.earnings, "allowances")).toBe(751); // 777 * 29 / 30 = 751.1
  });

  it("can round the net to a whole rupee and records the difference", () => {
    const p = run({ structure: { basic: 100001, hra: 0, allowances: 0, deductions: 0 }, manualLopDays: 1 }, { roundNetToRupee: true });
    expect(p.net % 100).toBe(0);
    expect(p.net).toBe(96700);
    expect(p.roundingAdjustment).toBe(96700 - 96668);
  });

  it("gives the same payslip every time (repeatable)", () => {
    const input: EngineInput = {
      period: { start: START, end: END },
      settings: { ...settings, overtimeEnabled: true },
      structure,
      components: [],
      employment: { joinedOn: "2020-01-01", leftOn: null },
      days: month({ "2026-11-03": { hoursHundredths: 1100 } }),
      adjustments: [],
    };
    expect(computePayslip(input)).toEqual(computePayslip(input));
  });
});

describe("attendance summary", () => {
  it("counts present, work from home, leave and days off worked", () => {
    const p = run({
      days: month(
        {
          "2026-11-03": { leave: true, hoursHundredths: 0 },
          "2026-11-04": { wfh: true, hoursHundredths: 800 },
          "2026-11-12": { compOffLeave: true, hoursHundredths: 0 },
          "2026-11-14": { hoursHundredths: 600, compOffEarned: true },
          "2026-11-15": { hoursHundredths: 400 },
        },
        [],
      ),
    });
    expect(p.employedWorkingDays).toBe(21);
    expect(p.presentDays).toBe(19); // 21 working days, minus 1 leave day and 1 comp-off leave day
    expect(p.wfhDays).toBe(1);
    expect(p.holidayWorkedDays).toBe(2);
    expect(p.compOffEarnedDays).toBe(1);
  });
});

describe("no salary structure", () => {
  it("returns zeros and a warning", () => {
    const p = run({ structure: null });
    expect(p.gross).toBe(0);
    expect(p.net).toBe(0);
    expect(p.warnings.join(" ")).toContain("salary structure");
  });
});
