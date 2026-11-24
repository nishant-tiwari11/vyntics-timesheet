import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildLetter } from "@/lib/offers/build";
import { checkLetter } from "@/lib/offers/check";
import { buildLetterPdf } from "@/lib/offers/pdf";
import { DEFAULT_COMPANY, emptyLetter } from "@/lib/offers/types";

const company = { ...DEFAULT_COMPANY, gstin: "08EIGPM6800Q1ZN", city: "Jaipur Rajasthan", registeredAddress: "Agra Road, Jaipur", signatoryName: "Arun Mudgal", signatoryTitle: "Founder" };
const input = {
  ...emptyLetter("2026-10-23"),
  candidateName: "Nishant Tiwari",
  candidateAddress: "Near Sarvoday Convent School, Main Road, Khedli Phatak, Kota, Rajasthan - 324001",
  candidateEmail: "n@example.com",
  designation: "Intern",
  joiningDate: "2026-10-19",
  reportingManager: "Arun Mudgal",
  phases: [
    { name: "Phase 1", startDate: "2026-10-19", endDate: "2027-01-18", isPaid: false, monthlyAmount: "", evaluationWindow: "January 2027" },
    { name: "Phase 2", startDate: "2027-01-19", endDate: "2027-07-18", isPaid: true, monthlyAmount: "12000", evaluationWindow: "July 2027" },
  ],
};

describe("the offer letter PDF", () => {
  it("is a real multi-page A4 PDF", async () => {
    const r = checkLetter(input);
    if (!r.ok) throw new Error(r.error);
    const bytes = await buildLetterPdf(buildLetter(r.data, company));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("builds every engagement type, and survives odd characters and very long words", async () => {
    for (const engagementType of ["unpaid_internship", "paid_internship", "phased_internship", "full_time"] as const) {
      const base = { ...input, engagementType, candidateName: "Zoë \u4e2d\u6587 O'Brien", candidateAddress: `${"x".repeat(180)} road` };
      const withPay =
        engagementType === "full_time"
          ? { ...base, ctc: "600000", probationMonths: "3", salaryBreakup: [{ label: "Basic", monthly: "30000" }, { label: "HRA", monthly: "20000" }] }
          : engagementType === "phased_internship"
            ? base
            : { ...base, phases: [{ ...input.phases[1], startDate: "2026-10-19", isPaid: engagementType === "paid_internship" }] };
      const r = checkLetter(withPay);
      if (!r.ok) throw new Error(`${engagementType}: ${r.error}`);
      const bytes = await buildLetterPdf(buildLetter(r.data, company));
      expect(bytes.byteLength).toBeGreaterThan(3000);
    }
  });

  it("ignores a picture that isn't a PNG instead of failing", async () => {
    const r = checkLetter(input);
    if (!r.ok) throw new Error(r.error);
    const bytes = await buildLetterPdf(buildLetter(r.data, company), { logo: new Uint8Array([1, 2, 3]), signature: new Uint8Array([9]) });
    expect(bytes.byteLength).toBeGreaterThan(3000);
  });
});
