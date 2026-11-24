import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import type { LetterBlock, LetterDoc } from "./types";

// The offer letter as a PDF, drawn from the same structure as the on-screen preview: A4, a logo header on every page, purple
// section headings, tables, an acceptance block, and a footer with the company, GSTIN and city. The standard PDF fonts can't
// draw every character, so anything outside Latin-1 becomes "?" (amounts are written "INR").

const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?").replace(/ /g, " ");

const W = 595.28;
const H = 841.89;
const ML = 56;
const MR = 56;
const CONTENT_W = W - ML - MR;
const TOP = H - 112; // below the header
const BOTTOM = 62; // above the footer
const PURPLE = rgb(0.42, 0.345, 0.659);
const LAVENDER = rgb(0.953, 0.941, 0.98);
const INK = rgb(0.12, 0.16, 0.22);
const GREY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.89);
const WHITE = rgb(1, 1, 1);

const SIZE = 10.5;
const LEAD = 14.5;

export type OfferPdfImages = { logo?: Uint8Array; signature?: Uint8Array; seal?: Uint8Array };

type Run = { text: string; bold: boolean };

export async function buildLetterPdf(letter: LetterDoc, images: OfferPdfImages = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Offer and appointment letter: ${letter.party[0]?.replace(/,$/, "") ?? ""}`));
  doc.setProducer("Vyntics Timesheet");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const embed = async (bytes: Uint8Array | undefined): Promise<PDFImage | null> => {
    if (!bytes) return null;
    try {
      return await doc.embedPng(bytes);
    } catch {
      return null; // a picture that can't be read is simply left out
    }
  };
  const [logo, signature, seal] = await Promise.all([embed(images.logo), embed(images.signature), embed(images.seal)]);

  const fit = (img: PDFImage, maxW: number, maxH: number) => {
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    return { width: img.width * s, height: img.height * s };
  };

  let page!: PDFPage;
  let y = TOP;

  function newPage() {
    page = doc.addPage([W, H]);
    if (logo) {
      const { width, height } = fit(logo, 56, 56);
      page.drawImage(logo, { x: ML, y: H - 36 - height, width, height });
    }
    const name = safe(letter.company.toUpperCase());
    page.drawText(name, { x: W - MR - bold.widthOfTextAtSize(name, 14), y: H - 56, size: 14, font: bold, color: PURPLE });
    if (letter.gstin) {
      const g = safe(`GSTIN ${letter.gstin}`);
      page.drawText(g, { x: W - MR - regular.widthOfTextAtSize(g, 8), y: H - 69, size: 8, font: regular, color: GREY });
    }
    page.drawLine({ start: { x: ML, y: H - 96 }, end: { x: W - MR, y: H - 96 }, thickness: 1.6, color: PURPLE });
    const foot = safe([letter.company.toUpperCase(), letter.gstin && `GSTIN ${letter.gstin}`, letter.city].filter(Boolean).join(" | "));
    page.drawText(foot, { x: (W - regular.widthOfTextAtSize(foot, 8)) / 2, y: 34, size: 8, font: regular, color: GREY });
    y = TOP;
  }
  const need = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };

  /** Split text into lines that fit `max` points; each line is a list of runs (so a bold lead-in can start a paragraph). */
  function wrap(runs: Run[], size: number, max: number): Run[][] {
    const lines: Run[][] = [];
    let line: Run[] = [];
    let width = 0;
    for (const r of runs) {
      const font = r.bold ? bold : regular;
      const spaceW = font.widthOfTextAtSize(" ", size);
      for (let word of safe(r.text).split(/\s+/).filter(Boolean)) {
        // A single very long word is cut so it can't run off the page.
        while (font.widthOfTextAtSize(word, size) > max && word.length > 1) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > max) cut -= 1;
          if (line.length) {
            lines.push(line);
            line = [];
            width = 0;
          }
          lines.push([{ text: word.slice(0, cut), bold: r.bold }]);
          word = word.slice(cut);
        }
        const w = font.widthOfTextAtSize(word, size);
        if (line.length && width + spaceW + w > max) {
          lines.push(line);
          line = [];
          width = 0;
        }
        const spaced = line.length > 0;
        const last = line[line.length - 1];
        if (last && last.bold === r.bold) last.text += ` ${word}`;
        else line.push({ text: spaced ? ` ${word}` : word, bold: r.bold });
        width += (spaced ? spaceW : 0) + w;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }
  const lineWidth = (line: Run[], size: number) => line.reduce((n, r) => n + (r.bold ? bold : regular).widthOfTextAtSize(r.text, size), 0);

  function drawLine(line: Run[], x: number, baseline: number, size: number, color = INK) {
    let cx = x;
    for (const r of line) {
      page.drawText(r.text, { x: cx, y: baseline, size, font: r.bold ? bold : regular, color });
      cx += (r.bold ? bold : regular).widthOfTextAtSize(r.text, size);
    }
  }

  function paragraph(runs: Run[], o: { size?: number; lead?: number; x?: number; max?: number; after?: number; color?: ReturnType<typeof rgb>; align?: "left" | "center" } = {}) {
    const size = o.size ?? SIZE;
    const lead = o.lead ?? LEAD;
    const x = o.x ?? ML;
    const max = o.max ?? CONTENT_W;
    for (const line of wrap(runs, size, max)) {
      need(lead);
      const dx = o.align === "center" ? (max - lineWidth(line, size)) / 2 : 0;
      drawLine(line, x + dx, y - size, size, o.color);
      y -= lead;
    }
    y -= o.after ?? 6;
  }

  // ---------------------------------------------------------------- title and opening
  newPage();
  paragraph([{ text: letter.title, bold: true }], { size: 18, lead: 22, align: "center", after: 2 });
  paragraph([{ text: letter.subtitle, bold: true }], { size: 9, lead: 12, align: "center", color: GREY, after: 14 });

  // The person's name on the left and the date on the right, then the rest of their details.
  need(60);
  const first = safe(letter.party[0] ?? "");
  page.drawText(first, { x: ML, y: y - SIZE, size: SIZE, font: regular, color: INK });
  const dateText = safe(`Date: ${letter.date}`);
  page.drawText(dateText, { x: W - MR - regular.widthOfTextAtSize(dateText, SIZE), y: y - SIZE, size: SIZE, font: regular, color: INK });
  y -= LEAD;
  for (const l of letter.party.slice(1)) paragraph([{ text: l, bold: false }], { after: 0 });
  y -= 10;
  paragraph([{ text: `Subject: ${letter.subject}`, bold: true }], { after: 10 });
  paragraph([{ text: letter.salutation, bold: false }]);

  // ---------------------------------------------------------------- tables
  function table(b: Extract<LetterBlock, { t: "table" }>) {
    const widths = b.widths.map((p) => (p / 100) * CONTENT_W);
    const size = 9.5;
    const pad = 6;
    const cellLines = (text: string, i: number, boldText: boolean) => wrap([{ text, bold: boldText }], size, widths[i] - pad * 2);
    const rowHeight = (cells: Run[][][]) => Math.max(...cells.map((c) => c.length)) * 12.5 + pad * 2;

    const drawRow = (cells: string[], opts: { header?: boolean; boldRow?: boolean }) => {
      const wrapped = cells.map((c, i) => cellLines(c, i, !!opts.header || i === 0 || !!opts.boldRow));
      const h = rowHeight(wrapped);
      if (y - h < BOTTOM) {
        newPage();
        if (b.header && !opts.header) drawRow(b.header, { header: true });
      }
      let x = ML;
      for (const [i, lines] of wrapped.entries()) {
        const fill = opts.header ? PURPLE : i === 0 ? LAVENDER : undefined;
        page.drawRectangle({ x, y: y - h, width: widths[i], height: h, color: fill, borderColor: LINE, borderWidth: 0.7 });
        const color = opts.header ? WHITE : INK;
        let ly = y - pad - size + 1;
        for (const line of lines) {
          const dx = b.align?.[i] === "right" ? widths[i] - pad * 2 - lineWidth(line, size) : 0;
          drawLine(line, x + pad + dx, ly, size, color);
          ly -= 12.5;
        }
        x += widths[i];
      }
      y -= h;
    };

    need(40);
    if (b.header) drawRow(b.header, { header: true });
    for (const [n, row] of b.rows.entries()) drawRow(row, { boldRow: b.boldLastRow && n === b.rows.length - 1 });
    y -= 12;
  }

  // ---------------------------------------------------------------- acceptance block
  function acceptance(b: Extract<LetterBlock, { t: "acceptance" }>) {
    const half = CONTENT_W / 2;
    const h = 128;
    need(26 + h);
    for (const [i, label] of [`For ${b.company}`, "Accepted by Candidate"].entries()) {
      page.drawRectangle({ x: ML + i * half, y: y - 22, width: half, height: 22, color: PURPLE, borderColor: LINE, borderWidth: 0.7 });
      page.drawText(safe(label), { x: ML + i * half + 8, y: y - 15, size: 9.5, font: bold, color: WHITE });
    }
    y -= 22;
    for (const i of [0, 1]) page.drawRectangle({ x: ML + i * half, y: y - h, width: half, height: h, color: LAVENDER, borderColor: LINE, borderWidth: 0.7 });
    const put = (text: string, x: number, yy: number, b2 = false) => page.drawText(safe(text), { x, y: yy, size: 9.5, font: b2 ? bold : regular, color: INK });
    const lx = ML + 8;
    put(`Name: ${b.signatoryName}`, lx, y - 16, true);
    if (b.signatoryTitle) put(`Designation: ${b.signatoryTitle}`, lx, y - 30, true);
    put("Signature:", lx, y - 46, true);
    if (signature) {
      const s = fit(signature, 110, 42);
      page.drawImage(signature, { x: lx + 52, y: y - 54 - s.height + 12, ...s });
    }
    if (seal) {
      const s = fit(seal, 62, 62);
      page.drawImage(seal, { x: ML + half - s.width - 10, y: y - 28 - s.height, ...s });
    }
    put(`Date: ${b.letterDate}`, lx, y - h + 12, true);
    const rx = ML + half + 8;
    put(`Name: ${b.candidateName}`, rx, y - 16);
    put("Signature:", rx, y - 46);
    put("Date:", rx, y - h + 12);
    if (b.typed) {
      // A typed acceptance, once the person has accepted in the portal.
      put(b.typed.name, rx + 52, y - 46, true);
      put(b.typed.date, rx + 28, y - h + 12, true);
    }
    y -= h + 14;
  }

  // ---------------------------------------------------------------- the blocks
  for (const b of letter.blocks) {
    if (b.t === "para") paragraph([{ text: b.text, bold: false }], { after: 7 });
    else if (b.t === "heading") {
      need(70);
      y -= 8;
      paragraph([{ text: b.text, bold: true }], { size: 12, lead: 17, color: PURPLE, after: 4 });
    } else if (b.t === "clause") {
      b.paras.forEach((text, i) => {
        const runs: Run[] = i === 0 ? [{ text: `${b.n}. ${b.title} - `, bold: true }, { text, bold: false }] : [{ text, bold: false }];
        paragraph(runs, { after: i === b.paras.length - 1 ? 8 : 5 });
      });
    } else if (b.t === "table") table(b);
    else if (b.t === "acceptance") acceptance(b);
    else if (b.t === "annexureTitle") {
      need(110);
      y -= 18;
      paragraph([{ text: b.text, bold: true }], { size: 14, lead: 20, color: PURPLE, align: "center", after: 8 });
    } else if (b.t === "note") paragraph([{ text: b.text, bold: false }], { size: 8.5, lead: 12, color: GREY, align: "center", after: 4 });
  }

  return doc.save();
}
