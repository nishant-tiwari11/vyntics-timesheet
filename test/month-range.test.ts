import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/timesheet/dates";

// My Salary asks for a payslip by month. It used to end the month at "-31", which is not a real day in November, April,
// June, September or February, and the database refused it ("date/time field value out of range"). The last day must be real.
describe("the last day of a month", () => {
  it("is a real day in every month", () => {
    expect(monthRange("2026-11-01").end).toBe("2026-11-30");
    expect(monthRange("2026-04-01").end).toBe("2026-04-30");
    expect(monthRange("2026-06-01").end).toBe("2026-06-30");
    expect(monthRange("2026-09-01").end).toBe("2026-09-30");
    expect(monthRange("2026-12-01").end).toBe("2026-12-31");
    expect(monthRange("2026-02-01").end).toBe("2026-02-28");
    expect(monthRange("2028-02-01").end).toBe("2028-02-29"); // a leap year
  });
});
