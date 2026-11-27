import { describe, expect, it } from "vitest";
import { workingToday } from "@/lib/admin/companyModel";

describe("working today roster", () => {
  it("deduplicates duty stretches and shows the first start with the current duty location", () => {
    const result = workingToday([{ id: "a", name: "Asha" }], [
      { user_id: "a", started_at: "2026-11-27T09:00:00Z", ended_at: null, location: "wfh" },
      { user_id: "a", started_at: "2026-11-27T04:00:00Z", ended_at: "2026-11-27T08:00:00Z", location: "office" },
    ], new Map([["a", 8]]));
    expect(result).toEqual([{ id: "a", name: "Asha", startedAt: "2026-11-27T04:00:00Z", onDuty: true, location: "wfh" }]);
  });
  it("includes work-log-only employees without inventing a start time and excludes inactive IDs", () => {
    expect(workingToday([{ id: "a", name: "Asha" }, { id: "b", name: "Bea" }], [
      { user_id: "disabled", started_at: "2026-11-27T04:00:00Z", ended_at: null, location: "office" },
    ], new Map([["a", 2], ["b", 0]]))).toEqual([{ id: "a", name: "Asha", startedAt: null, onDuty: false, location: null }]);
  });
});
