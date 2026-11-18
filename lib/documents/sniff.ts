import JSZip from "jszip";
import type { DocKind } from "./config";

// What a file really is, read from its first bytes, not from its name or the type the browser claims. Only the five
// allowed kinds are recognised, so an executable, a script or an archive renamed to ".pdf" is not any of them and is refused.

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export async function detectKind(bytes: Uint8Array): Promise<DocKind | null> {
  if (bytes.length < 8) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc"; // old Word (OLE2)
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A .docx is a zip with word/document.xml. Anything else in a zip (or a macro project) is not accepted.
    try {
      const zip = await JSZip.loadAsync(bytes);
      const names = Object.keys(zip.files);
      const isDocx = names.includes("[Content_Types].xml") && names.includes("word/document.xml");
      const hasMacros = names.some((n) => n.toLowerCase().endsWith("vbaproject.bin"));
      return isDocx && !hasMacros ? "docx" : null;
    } catch {
      return null;
    }
  }
  return null;
}
