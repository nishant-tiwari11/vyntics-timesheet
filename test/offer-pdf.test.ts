import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { checkOffer, offerDefaults } from "@/lib/documents/offerLetter";
import { buildOfferPdf } from "@/lib/documents/offerPdf";

describe("offer letter PDF", () => {
  it("builds a real PDF, even with odd characters and long text", async () => {
    const r = checkOffer({
      ...offerDefaults("2026-11-18", "Asha Rao ✓ 日本"),
      designation: "Senior Software Engineer",
      department: "Engineering",
      location: "Pune, Maharashtra",
      ctc: "₹ 12,00,000 per year",
      reportingTo: "Ravi Menon",
      companyAddress: "4th Floor, Example Tower, Baner Road, Pune 411045, Maharashtra, India",
      signatoryName: "Priya Shah",
    });
    if (!r.ok) throw new Error(r.error);
    const bytes = await buildOfferPdf(r.data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1500);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1); // a normal letter, including the acceptance block, fits on one A4 page
    const [page] = parsed.getPages();
    expect(page.getSize()).toEqual({ width: 595, height: 842 });
    if (process.env.OFFER_PDF_OUT) fs.writeFileSync(process.env.OFFER_PDF_OUT, bytes);
  });
});
