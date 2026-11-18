import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { PDFFont } from "pdf-lib";
import { offerLetter, DEFAULT_OFFER_TEMPLATE, type OfferFields } from "./offerLetter";
import { fitInside, pngSize } from "./pngInfo";

// The offer letter as a PDF: A4, black on white. The standard PDF fonts can't draw every character, so anything outside
// Latin-1 becomes "?" (the rupee sign is already written "INR" by checkOffer and checkTemplate).
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?").replace(/ /g, " ");

const W = 595;
const H = 842;
const M = 64;
const SIZE = 11;
const LEAD = 16;

function wrap(font: PDFFont, text: string, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safe(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= max) line = next;
    else {
      if (line) lines.push(line);
      // A single very long word is cut so it can't run off the page.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > max && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > max) cut -= 1;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type OfferPdfOptions = {
  /** PNG bytes of the signatory's signature, drawn in the gap above their name. */
  signature?: Uint8Array;
  /** PNG bytes of the company seal, drawn beside the signature block. */
  seal?: Uint8Array;
};

export async function buildOfferPdf(fields: OfferFields, template: string = DEFAULT_OFFER_TEMPLATE, options: OfferPdfOptions = {}): Promise<Uint8Array> {
  const letter = offerLetter(fields, template);
  const doc = await PDFDocument.create();
  doc.setTitle(`Offer letter: ${safe(fields.name)}`);
  doc.setProducer("Vyntics");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const maxWidth = W - 2 * M;
  const signatureImg = options.signature && pngSize(options.signature) ? await doc.embedPng(options.signature) : null;
  const sealImg = options.seal && pngSize(options.seal) ? await doc.embedPng(options.seal) : null;
  const SIG_H = 48; // room for the signature where the template has "[space]"

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => {
    if (y - need < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const line = (t: string, font = regular, size = SIZE, color = black) => {
    ensure(LEAD);
    page.drawText(safe(t), { x: M, y, size, font, color });
    y -= LEAD;
  };
  // A block is a paragraph; each of its lines is wrapped on its own. "[space]" is a gap, and the signatory is in bold.
  const block = (lines: string[], gap = 8) => {
    const isSigning = lines.includes(letter.signatory);
    if (isSigning && (signatureImg || sealImg)) ensure(LEAD * lines.length + SIG_H + 40); // keep the signing block, its signature and seal together
    const topY = y;
    for (const l of lines) {
      if (l === "[space]") {
        const room = signatureImg ? SIG_H : 22;
        ensure(room);
        if (signatureImg) {
          const size = fitInside({ width: signatureImg.width, height: signatureImg.height }, 170, SIG_H - 4);
          page.drawImage(signatureImg, { x: M, y: y - size.height - 2, width: size.width, height: size.height });
        }
        y -= room;
        continue;
      }
      const font = l === letter.signatory ? bold : regular;
      for (const part of wrap(font, l, SIZE, maxWidth)) line(part, font);
    }
    if (isSigning && sealImg) {
      // The seal sits to the right of the signing block, partly overlapping it like a stamp.
      const size = fitInside({ width: sealImg.width, height: sealImg.height }, 96, 96);
      page.drawImage(sealImg, { x: M + 230, y: Math.max(topY - size.height - 6, M / 2), width: size.width, height: size.height, opacity: 0.9 });
    }
    y -= gap;
  };

  // Letterhead
  page.drawText(safe(letter.company), { x: M, y, size: 18, font: bold, color: black });
  y -= 20;
  for (const l of wrap(regular, letter.address, 9, maxWidth)) {
    page.drawText(l, { x: M, y, size: 9, font: regular, color: gray });
    y -= 12;
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: black });
  y -= 26;

  line(`Date: ${letter.date}`);
  y -= 10;
  line(safe(letter.recipient), bold);
  y -= 10;
  if (letter.subject) {
    for (const l of wrap(bold, `Subject: ${letter.subject}`, SIZE, maxWidth)) line(l, bold);
    y -= 8;
  }
  for (const b of letter.blocks) block(b);

  // Acceptance block, kept together on one page
  if (letter.acceptance.length > 0) {
    const lines = letter.acceptance.reduce((n, b) => n + b.length + 1, 0);
    ensure(LEAD * lines + 36);
    y -= 12;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: gray });
    y -= 18;
    letter.acceptance.forEach((b, i) => {
      const [head, ...rest] = b;
      if (i === 0) {
        line(head, bold);
        block(rest, 4);
      } else block(b, 4);
    });
  }
  return doc.save();
}
