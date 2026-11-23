import { describe, expect, it } from "vitest";
import { checkBank, emptyAnswers, maskAccount, missingForSubmit, neededDocs } from "@/lib/onboarding/rules";

const bank = { holder: "Ved Sharma", bankName: "HDFC Bank", account: "123456789012", ifsc: "HDFC0001234", branch: "Indiranagar", type: "savings" as const, confirmed: true };

describe("neededDocs", () => {
  it("asks for the degree or the marksheets, Aadhaar and the photo", () => {
    expect(neededDocs({ degreeMode: "degree", hasExperience: false, experienceType: null }).map((n) => n.category)).toEqual(["degree", "aadhaar", "passport_photo"]);
    expect(neededDocs({ degreeMode: "marksheets", hasExperience: false, experienceType: null })[0].category).toBe("marksheets");
  });
  it("adds the previous offer letter for past experience, and a payslip only when paid", () => {
    const free = neededDocs({ degreeMode: "degree", hasExperience: true, experienceType: "free_internship" }).map((n) => n.category);
    expect(free).toContain("prev_offer_letter");
    expect(free).not.toContain("prev_payslip");
    expect(neededDocs({ degreeMode: "degree", hasExperience: true, experienceType: "paid" }).map((n) => n.category)).toContain("prev_payslip");
  });
});

describe("checkBank", () => {
  it("accepts good details", () => expect(checkBank(bank, "123456789012")).toBeNull());
  it("catches each kind of mistake", () => {
    expect(checkBank({ ...bank, account: "12ab" })).toMatch(/account number/);
    expect(checkBank(bank, "999999999999")).toMatch(/don't match/);
    expect(checkBank({ ...bank, ifsc: "HDFC123" })).toMatch(/IFSC/);
    expect(checkBank({ ...bank, type: "" })).toMatch(/type of account/);
    expect(checkBank({ ...bank, confirmed: false })).toMatch(/confirm/);
  });
  it("is fine with a lower-case IFSC", () => expect(checkBank({ ...bank, ifsc: "hdfc0001234" })).toBeNull());
});

describe("missingForSubmit", () => {
  it("lists everything on an empty form", () => {
    const m = missingForSubmit(emptyAnswers(), new Set());
    expect(m.length).toBeGreaterThanOrEqual(5);
  });
  it("is empty when all is done", () => {
    const a = { ...emptyAnswers(), degreeMode: "degree" as const, hasExperience: false, bank };
    expect(missingForSubmit(a, new Set(["degree", "aadhaar", "passport_photo"]), bank.account)).toEqual([]);
  });
  it("wants the payslip for a paid past job", () => {
    const a = { ...emptyAnswers(), degreeMode: "degree" as const, hasExperience: true, experienceType: "paid" as const, bank };
    const m = missingForSubmit(a, new Set(["degree", "aadhaar", "passport_photo", "prev_offer_letter"]), bank.account);
    expect(m).toEqual(["Upload: Your latest payslip."]);
  });
});

describe("maskAccount", () => {
  it("shows only the last four", () => expect(maskAccount("123456789012")).toBe("XXXXXXXX9012"));
});
