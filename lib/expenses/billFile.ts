// Checking a bill file before it is stored. Plain code with no server-only imports, so the browser and the tests can use it.

export const BILL_MAX_BYTES = 8 * 1024 * 1024;
export const BILL_MAX_PER_CLAIM = 5;
export const BILL_TYPES_TEXT = "PDF, JPG, PNG or WebP, up to 8 MB";
export const BILL_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export type BillKind = { mime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"; ext: "pdf" | "jpg" | "png" | "webp" };

/** What the file really is, from its first bytes (the name and the type the browser sent can't be trusted). null if it isn't allowed. */
export function sniffBill(bytes: Uint8Array): BillKind | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 5 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46 && at(4) === 0x2d) return { mime: "application/pdf", ext: "pdf" }; // %PDF-
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}

/** A file name that is safe to show and to keep: no folders, no control characters, not too long. */
export function safeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  const cut = base.length > 120 ? `${base.slice(0, 100)}${base.slice(base.lastIndexOf("."))}`.slice(0, 120) : base;
  return cut || "bill";
}

export type Bill = { id: string; claimId: string; name: string; mime: string; size: number };

export const fmtSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
