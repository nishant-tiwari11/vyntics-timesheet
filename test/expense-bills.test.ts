import { describe, expect, it } from "vitest";
import { fmtSize, safeFileName, sniffBill } from "@/lib/expenses/billFile";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("sniffBill", () => {
  it("knows a PDF, JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffBill(new TextEncoder().encode("%PDF-1.7 ..."))).toEqual({ mime: "application/pdf", ext: "pdf" });
    expect(sniffBill(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffBill(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffBill(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toEqual({ mime: "image/webp", ext: "webp" });
  });
  it("refuses anything else, whatever the file is called", () => {
    expect(sniffBill(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffBill(new TextEncoder().encode("MZ\x90\x00 fake.pdf"))).toBeNull();
    expect(sniffBill(new Uint8Array())).toBeNull();
    expect(sniffBill(new TextEncoder().encode("%PDF"))).toBeNull(); // too short to be a real header
  });
});

describe("safeFileName", () => {
  it("drops folders and odd characters, and never returns an empty name", () => {
    expect(safeFileName(String.raw`C:\Users\me\Receipt 12.pdf`)).toBe("Receipt 12.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName('a<b>:"c|d?.png')).toBe("abcd.png");
    expect(safeFileName("  ")).toBe("bill");
    expect(safeFileName(`${"x".repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
    expect(safeFileName(`${"x".repeat(300)}.pdf`).endsWith(".pdf")).toBe(true);
  });
});

describe("fmtSize", () => {
  it("shows KB or MB", () => {
    expect(fmtSize(500)).toBe("1 KB");
    expect(fmtSize(250 * 1024)).toBe("250 KB");
    expect(fmtSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
