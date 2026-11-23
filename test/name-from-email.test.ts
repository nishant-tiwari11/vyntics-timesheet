import { describe, expect, it } from "vitest";
import { joinName, nameFromEmail, splitName } from "@/lib/nameFromEmail";

describe("nameFromEmail", () => {
  it("splits first and last at the dot", () => {
    expect(nameFromEmail("ved.sharma@vyntics.com")).toEqual({ first: "Ved", last: "Sharma", full: "Ved Sharma" });
  });
  it("is case-insensitive and keeps extra parts in the last name", () => {
    expect(nameFromEmail("ANITA.K.Rao@Vyntics.com")?.full).toBe("Anita K Rao");
  });
  it("uses only the first name when there is no dot", () => {
    expect(nameFromEmail("ved@vyntics.com")).toEqual({ first: "Ved", last: "", full: "Ved" });
  });
  it("gives nothing for other domains or bad input", () => {
    expect(nameFromEmail("ved.sharma@gmail.com")).toBeNull();
    expect(nameFromEmail("ved.sharma@vyntics.com.evil.io")).toBeNull();
    expect(nameFromEmail("")).toBeNull();
    expect(nameFromEmail(null)).toBeNull();
  });
});

describe("splitName / joinName", () => {
  it("round-trips", () => {
    expect(splitName("Ved Kumar Sharma")).toEqual({ first: "Ved", last: "Kumar Sharma" });
    expect(joinName(" Ved ", " Sharma ")).toBe("Ved Sharma");
    expect(joinName("Ved", "")).toBe("Ved");
  });
});
