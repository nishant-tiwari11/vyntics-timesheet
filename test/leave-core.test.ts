import { describe, expect, it } from "vitest";
import { computeBalance } from "@/lib/timesheet/compOffCore";
import { byMonth, leaveDays, paidLeaveStatus, sumDays } from "@/lib/timesheet/leaveCore";

const none = new Set<string>();

describe("leaveDays", () => {
  it("skips weekends and holidays", () => {
    // Fri 2026-11-20 to Tue 2026-11-24: Fri, Mon, Tue
    expect(leaveDays("2026-11-20", "2026-11-24", "full", none).map((d) => d.date)).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
    expect(leaveDays("2026-11-20", "2026-11-24", "full", new Set(["2026-11-23"])).length).toBe(2);
  });
  it("costs half a day for a half-day request, and nothing on a weekend", () => {
    expect(sumDays(leaveDays("2026-11-23", "2026-11-23", "first_half", none))).toBe(0.5);
    expect(leaveDays("2026-11-22", "2026-11-22", "full", none)).toEqual([]);
  });
  it("ignores the half-day part for a range", () => {
    expect(sumDays(leaveDays("2026-11-23", "2026-11-24", "first_half", none))).toBe(2);
  });
});

describe("paid leave per month", () => {
  const ask = leaveDays("2026-11-27", "2026-12-01", "full", none); // Fri 27, Mon 30, Tue 1 Dec
  it("splits by month", () => expect([...byMonth(ask)]).toEqual([["2026-11", 2], ["2026-12", 1]]));
  it("shows what is left and what goes over", () => {
    const status = paidLeaveStatus(2, new Map([["2026-11", 1]]), ask);
    expect(status).toEqual([
      { month: "2026-11", quota: 2, used: 1, left: 1, asking: 2, over: 1 },
      { month: "2026-12", quota: 2, used: 0, left: 2, asking: 1, over: 0 },
    ]);
  });
});

describe("comp-off balance can go negative", () => {
  it("is a debt when leave is taken before any credit", () => {
    const b = computeBalance([], [{ date: "2026-11-23", days: 0.5 }], "2026-11-20");
    expect(b).toMatchObject({ available: 0, shortfall: 0.5, balance: -0.5 });
  });
  it("is paid back by credit earned later", () => {
    const b = computeBalance([{ id: "a", credit: 1, expiresOn: "2027-02-01" }], [{ date: "2026-11-23", days: 0.5 }], "2026-11-30");
    expect(b).toMatchObject({ available: 0.5, shortfall: 0, balance: 0.5 });
  });
  it("still accepts plain dates", () => {
    expect(computeBalance([{ id: "a", credit: 2, expiresOn: "2027-01-01" }], ["2026-11-23"], "2026-11-20").balance).toBe(1);
  });
});
