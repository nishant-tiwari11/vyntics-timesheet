import { describe, expect, it } from "vitest";
import { avatarPath, avatarUrl, initials, isUuid } from "@/lib/avatar";

const ID = "3f2c1d9e-8a4b-4c1e-9d7a-0b5e6f7a8b9c";

describe("avatar helpers", () => {
  it("makes initials", () => {
    expect(initials("Nishant Tiwari")).toBe("NT");
    expect(initials("nishant")).toBe("N");
    expect(initials("  Anna  Maria  Lopez ")).toBe("AL");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });
  it("only accepts real ids, so a path can't be steered", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("../secret")).toBe(false);
    expect(isUuid(`${ID}.webp`)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
  it("builds the storage path and the address", () => {
    expect(avatarPath(ID.toUpperCase())).toBe(`${ID}.webp`);
    expect(avatarUrl(ID)).toBe(`/timesheet/avatar/${ID}`);
    expect(avatarUrl(ID, 5)).toBe(`/timesheet/avatar/${ID}?v=5`);
  });
});
