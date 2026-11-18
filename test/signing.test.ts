import forge from "node-forge";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { docxPlaceholders, fillDocx } from "@/lib/documents/docxTemplate";
import { checkOffer, offerDefaults, placeholderValues } from "@/lib/documents/offerLetter";
import { buildOfferPdf } from "@/lib/documents/offerPdf";
import { fitInside, pngSize } from "@/lib/documents/pngInfo";
import { certificateConfigured } from "@/lib/documents/signPdf";
import { detectKind } from "@/lib/documents/sniff";

const r = checkOffer({ ...offerDefaults("2026-11-18", "Asha Rao"), designation: "Engineer", signatoryName: "Priya Shah" });
if (!r.ok) throw new Error("setup");

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 40, b: 160, alpha: 0.6 } } }).png().toBuffer();

/** A throwaway self-signed certificate, only for these tests. */
function testP12(password: string): string {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 30);
  const attrs = [{ name: "commonName", value: "Test Signer" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" })).getBytes();
  return Buffer.from(der, "binary").toString("base64");
}

describe("picture helpers", () => {
  it("reads a PNG's size from its header", async () => {
    expect(pngSize(new Uint8Array(await png(200, 80)))).toEqual({ width: 200, height: 80 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("fits a picture inside a box without stretching or enlarging", () => {
    expect(fitInside({ width: 600, height: 240 }, 170, 64)).toEqual({ width: 160, height: 64 });
    expect(fitInside({ width: 50, height: 20 }, 170, 64)).toEqual({ width: 50, height: 20 });
  });
});

describe("signature and seal on the PDF letter", () => {
  it("draws both pictures and still fits one page", async () => {
    const plain = await buildOfferPdf(r.data);
    const withImages = await buildOfferPdf(r.data, undefined, { signature: new Uint8Array(await png(600, 200)), seal: new Uint8Array(await png(300, 300)) });
    expect(withImages.byteLength).toBeGreaterThan(plain.byteLength);
    const parsed = await PDFDocument.load(withImages);
    expect(parsed.getPageCount()).toBe(1);
  });
  it("ignores bytes that aren't a PNG instead of failing", async () => {
    const pdf = await buildOfferPdf(r.data, undefined, { signature: new Uint8Array([1, 2, 3, 4]) });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("digital signature on the PDF", () => {
  const saved = { b64: process.env.SIGNING_P12_BASE64, pw: process.env.SIGNING_P12_PASSWORD };
  afterEach(() => {
    process.env.SIGNING_P12_BASE64 = saved.b64;
    process.env.SIGNING_P12_PASSWORD = saved.pw;
    if (saved.b64 === undefined) delete process.env.SIGNING_P12_BASE64;
    if (saved.pw === undefined) delete process.env.SIGNING_P12_PASSWORD;
  });
  beforeAll(() => {
    delete process.env.SIGNING_P12_BASE64;
    delete process.env.SIGNING_P12_PASSWORD;
  });

  it("is off until both settings exist", () => {
    expect(certificateConfigured()).toBe(false);
    process.env.SIGNING_P12_BASE64 = "abc";
    expect(certificateConfigured()).toBe(false);
  });

  it("refuses to sign with no certificate", async () => {
    await expect(buildOfferPdf(r.data, undefined, { digitalSign: true })).rejects.toThrow(/isn't set up/);
  });

  it("signs the PDF with a certificate: a signature is embedded over the whole file", async () => {
    process.env.SIGNING_P12_BASE64 = testP12("secret-pw");
    process.env.SIGNING_P12_PASSWORD = "secret-pw";
    const pdf = await buildOfferPdf(r.data, undefined, { digitalSign: true });
    const text = Buffer.from(pdf).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/ByteRange");
    expect(text).toContain("adbe.pkcs7.detached");
    // The placeholder was replaced: the signature contents are real hex, not the zero padding.
    const contents = /\/Contents\s*<([0-9a-fA-F]+)>/.exec(text)?.[1] ?? "";
    expect(contents.replace(/0+$/, "").length).toBeGreaterThan(200);
    // Still a readable PDF.
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  }, 60_000);

  it("gives a plain message (never the certificate or password) when the certificate is wrong", async () => {
    process.env.SIGNING_P12_BASE64 = Buffer.from("not a certificate").toString("base64");
    process.env.SIGNING_P12_PASSWORD = "top-secret-password";
    const err = await buildOfferPdf(r.data, undefined, { digitalSign: true }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("top-secret-password");
    expect((err as Error).message).toMatch(/certificate/i);
  });
});

describe("signature and seal in a Word template", () => {
  const text = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
  const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  async function makeDocx() {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file("word/_rels/document.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    zip.file("word/document.xml", `<w:document><w:body>${para("Dear {{name}},")}${para("{{signature}}")}${para("{{signatoryName}}")}${para("{{seal}}")}</w:body></w:document>`);
    zip.file("word/footer1.xml", `<w:ftr>${para("{{company}} {{seal}}")}</w:ftr>`);
    return zip.generateAsync({ type: "uint8array" });
  }

  it("knows {{signature}} and {{seal}} as valid details", async () => {
    expect(await docxPlaceholders(await makeDocx())).toEqual({ found: ["name", "signature", "signatoryName", "seal", "company"], unknown: [] });
  });

  it("puts the pictures into the letter body, and stays a valid .docx", async () => {
    const out = await fillDocx(await makeDocx(), placeholderValues(r.data), { signature: new Uint8Array(await png(600, 200)), seal: new Uint8Array(await png(300, 300)) });
    expect(await detectKind(out)).toBe("docx");
    const zip = await JSZip.loadAsync(out);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc.match(/<w:drawing>/g)).toHaveLength(2);
    expect(text(doc)).toBe("Dear Asha Rao,Priya Shah");
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["word/media/vyntics-signature.png", "word/media/vyntics-seal.png"]));
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain('Id="rIdVynticssignature"');
    expect(rels).toContain('Target="media/vyntics-seal.png"');
    expect(await zip.file("[Content_Types].xml")!.async("string")).toContain('Extension="png"');
    // Headers and footers get no pictures; the placeholder is just removed.
    const footer = await zip.file("word/footer1.xml")!.async("string");
    expect(footer).not.toContain("<w:drawing>");
    expect(text(footer)).toBe("Vyntics ");
  });

  it("removes the placeholders when no pictures are uploaded", async () => {
    const out = await fillDocx(await makeDocx(), placeholderValues(r.data));
    const zip = await JSZip.loadAsync(out);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).not.toContain("<w:drawing>");
    expect(text(doc)).toBe("Dear Asha Rao,Priya Shah");
    expect(Object.keys(zip.files).some((n) => n.includes("media/"))).toBe(false);
  });
});
