import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { checkMeta, expiryState, fmtSize, kindFromName, nameFromFile, profileCompletion, requiredChecklist, REQUIRED_CATEGORIES } from "@/lib/documents/config";
import { detectKind } from "@/lib/documents/sniff";

const bytes = (...v: number[]) => new Uint8Array([...v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("detectKind (reads the real file, not its name)", () => {
  it("recognises the allowed kinds", async () => {
    expect(await detectKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe("pdf");
    expect(await detectKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(await detectKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(await detectKind(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe("doc");
  });
  it("accepts a real docx but not another zip or one with macros", async () => {
    const make = async (files: string[]) => {
      const zip = new JSZip();
      for (const f of files) zip.file(f, "x");
      return zip.generateAsync({ type: "uint8array" });
    };
    expect(await detectKind(await make(["[Content_Types].xml", "word/document.xml"]))).toBe("docx");
    expect(await detectKind(await make(["a.txt"]))).toBeNull();
    expect(await detectKind(await make(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]))).toBeNull();
  });
  it("refuses executables and scripts, whatever they are called", async () => {
    expect(await detectKind(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // Windows .exe
    expect(await detectKind(bytes(0x7f, 0x45, 0x4c, 0x46))).toBeNull(); // Linux ELF
    expect(await detectKind(new TextEncoder().encode("#!/bin/sh\nrm -rf /\n"))).toBeNull();
    expect(await detectKind(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(await detectKind(new Uint8Array([1, 2]))).toBeNull();
  });
});

describe("names and sizes", () => {
  it("reads the kind from the name", () => {
    expect(kindFromName("a.PDF")).toBe("pdf");
    expect(kindFromName("a.jpg")).toBe("jpeg");
    expect(kindFromName("a.exe")).toBeNull();
    expect(kindFromName("noext")).toBeNull();
  });
  it("tidies", () => {
    expect(nameFromFile("Offer letter.final.pdf")).toBe("Offer letter.final");
    expect(fmtSize(512)).toBe("512 B");
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});

describe("checkMeta", () => {
  const ok = { category: "id_proof", name: "PAN card", issueDate: "2020-01-01", expiryDate: "2030-01-01", notes: "" };
  it("accepts good input and drops empty dates", () => {
    expect(checkMeta(ok)).toMatchObject({ ok: true, data: { category: "id_proof", name: "PAN card" } });
    expect(checkMeta({ ...ok, issueDate: "", expiryDate: undefined })).toMatchObject({ ok: true, data: { issueDate: null, expiryDate: null } });
  });
  it("rejects bad input with a message", () => {
    expect(checkMeta({ ...ok, category: "nope" })).toEqual({ ok: false, error: "Choose a category." });
    expect(checkMeta({ ...ok, name: "  " })).toMatchObject({ ok: false });
    expect(checkMeta({ ...ok, expiryDate: "2019-01-01" })).toMatchObject({ ok: false });
    expect(checkMeta({ ...ok, issueDate: "2020-13-45" })).toMatchObject({ ok: false });
    expect(checkMeta({ ...ok, notes: "x".repeat(501) })).toMatchObject({ ok: false });
  });
});

describe("required documents and completion", () => {
  it("has eight required categories", () => {
    expect(REQUIRED_CATEGORIES).toHaveLength(8);
  });
  it("counts pending and verified, not rejected", () => {
    const c = requiredChecklist([
      { category: "offer_letter", status: "verified" },
      { category: "id_proof", status: "pending" },
      { category: "id_proof", status: "rejected" },
      { category: "bank_details", status: "rejected" },
      { category: "other", status: "verified" },
    ]);
    expect(c).toMatchObject({ done: 2, total: 8 });
    expect(c.items.find((i) => i.category.id === "id_proof")!.state).toBe("pending");
    expect(c.items.find((i) => i.category.id === "bank_details")!.state).toBe("rejected");
  });
  it("works out the profile completion", () => {
    expect(profileCompletion({ hasPhoto: true, hasName: true, docsDone: 5, docsTotal: 8 })).toEqual({ percent: 70, done: 7, total: 10 });
    expect(profileCompletion({ hasPhoto: false, hasName: true, docsDone: 0, docsTotal: 8 }).percent).toBe(10);
  });
  it("flags expired and soon-to-expire documents", () => {
    expect(expiryState("2026-11-01", "2026-11-18")).toBe("expired");
    expect(expiryState("2026-12-10", "2026-11-18")).toBe("soon");
    expect(expiryState("2027-06-01", "2026-11-18")).toBeNull();
    expect(expiryState(null, "2026-11-18")).toBeNull();
  });
});
