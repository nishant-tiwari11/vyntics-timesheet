import { describe, expect, it } from "vitest";
import { durationText, dutyEligible, toHours } from "@/lib/timesheet/dutyTypes";
import { isDayOff, needsDecision } from "@/lib/timesheet/holidayTypes";

describe("duty helpers", () => {
  it("writes durations", () => {
    expect(durationText(0)).toBe("0 m");
    expect(durationText(45 * 60)).toBe("45 m");
    expect(durationText(3600 + 20 * 60)).toBe("1 h 20 m");
  });
  it("turns seconds into hours", () => {
    expect(toHours(3600)).toBe(1);
    expect(toHours(4500)).toBe(1.25);
  });
  it("is for employees and managers only", () => {
    expect(dutyEligible("employee")).toBe(true);
    expect(dutyEligible("manager")).toBe(true);
    expect(dutyEligible("admin")).toBe(false);
    expect(dutyEligible("viewer")).toBe(false);
  });
});

describe("holidays and the office", () => {
  it("is only a day off once an admin closes the office", () => {
    expect(isDayOff({ officeOff: false })).toBe(false);
    expect(isDayOff({ officeOff: true })).toBe(true);
  });
  it("asks about public holidays and festivals nobody has decided", () => {
    expect(needsDecision({ type: "public", decided: false })).toBe(true);
    expect(needsDecision({ type: "festival", decided: false })).toBe(true);
    expect(needsDecision({ type: "public", decided: true })).toBe(false);
    expect(needsDecision({ type: "optional", decided: false })).toBe(false);
  });
});
