import { describe, expect, it } from "vitest";
import { compOffShortMessage } from "@/lib/timesheet/compOffCore";

describe("compOffShortMessage", () => {
  it("says what is wrong and what to do when there is no comp-off at all", () => {
    const m = compOffShortMessage(0, 1);
    expect(m).toMatch(/don't have any comp-off/);
    expect(m).toMatch(/normal leave/);
    expect(m).toMatch(/weekly off day or a holiday/);
  });

  it("explains that a half day can't cover a full day, and how much more is needed", () => {
    const m = compOffShortMessage(0.5, 1);
    expect(m).toMatch(/0\.5 day of comp-off, and this request needs 1 day/);
    expect(m).toMatch(/half day can't cover a day off/);
    expect(m).toMatch(/normal leave instead/);
    expect(m).toMatch(/earn 0\.5 day more/);
  });

  it("does not talk about half days when the credit is a whole day or more", () => {
    const m = compOffShortMessage(2, 3);
    expect(m).toMatch(/2 days of comp-off, and this request needs 3 days/);
    expect(m).not.toMatch(/half day can't/);
    expect(m).toMatch(/earn 1 day more/);
  });
});
