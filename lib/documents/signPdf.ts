import "server-only";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import type { PDFDocument } from "pdf-lib";

// A real (cryptographic) digital signature on the offer letter PDF: PDF readers such as Adobe Acrobat show who signed and
// whether the file was changed afterwards. The certificate is a PKCS#12 (.p12 / .pfx) file kept ONLY in the server's
// environment (SIGNING_P12_BASE64 = the file, base64-encoded; SIGNING_P12_PASSWORD). It is never stored in the database or
// in file storage, never sent to the browser and never logged. Without both variables this feature is simply off.
//
// Note: a hardware token (the USB "DSC" that many certificate authorities issue) can't be used here, because its private
// key can't leave the token. A software certificate (a .p12 you can export) or a signing service is needed.

export function certificateConfigured(): boolean {
  return !!process.env.SIGNING_P12_BASE64 && !!process.env.SIGNING_P12_PASSWORD;
}

/** Reserve the signature in the PDF. Must be done before `doc.save({ useObjectStreams: false })`. */
export function addSignaturePlaceholder(doc: PDFDocument, info: { name: string; reason: string; location?: string }) {
  pdflibAddPlaceholder({ pdfDoc: doc, reason: info.reason, contactInfo: "", name: info.name, location: info.location ?? "", signatureLength: 12288 });
}

/** Sign a PDF that has the placeholder. Throws a plain Error (never including the certificate or password). */
export async function signPdfBytes(pdf: Uint8Array): Promise<Uint8Array> {
  if (!certificateConfigured()) throw new Error("Digital signing isn't set up on this server.");
  let signer: P12Signer;
  try {
    signer = new P12Signer(Buffer.from(process.env.SIGNING_P12_BASE64!, "base64"), { passphrase: process.env.SIGNING_P12_PASSWORD! });
  } catch {
    throw new Error("The signing certificate couldn't be read. Check SIGNING_P12_BASE64 and SIGNING_P12_PASSWORD.");
  }
  try {
    const signed = await signpdf.sign(Buffer.from(pdf), signer);
    return new Uint8Array(signed);
  } catch {
    // The certificate is only read when signing, so a wrong file or password shows up here. Say so plainly.
    throw new Error("The signing certificate couldn't be used. Check SIGNING_P12_BASE64 and SIGNING_P12_PASSWORD.");
  }
}
