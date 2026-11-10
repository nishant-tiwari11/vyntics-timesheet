import { describe, expect, it } from "vitest";
import { isMonthKey, monthContaining, periodForMonth } from "./period";

describe("pay month dates", () => {
  it("is the calendar month when the cycle starts on the 1st", () => {
    expect(periodForMonth("2026-11", 1)).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(periodForMonth("2026-12", 1)).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(periodForMonth("2028-02", 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" }); // leap year
  });

  it("runs from the start day to the day before it, named after the month it ends in", () => {
    expect(periodForMonth("2026-11", 26)).toEqual({ start: "2026-10-26", end: "2026-11-25" });
    expect(periodForMonth("2027-01", 26)).toEqual({ start: "2026-12-26", end: "2027-01-25" }); // across the new year
    expect(periodForMonth("2026-03", 2)).toEqual({ start: "2026-02-02", end: "2026-03-01" });
  });

  it("finds the pay month a date belongs to", () => {
    expect(monthContaining("2026-11-15", 1)).toBe("2026-11");
    expect(monthContaining("2026-11-25", 26)).toBe("2026-11");
    expect(monthContaining("2026-11-26", 26)).toBe("2026-12");
    expect(monthContaining("2026-12-31", 26)).toBe("2027-01");
  });

  it("recognises month keys", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });
});
