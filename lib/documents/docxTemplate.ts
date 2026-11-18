import JSZip from "jszip";
import { TEMPLATE_PLACEHOLDERS } from "./offerLetter";
import { fitInside, pngSize } from "./pngInfo";

// Fills a Word (.docx) template. The admin writes their own letter in Word and types {{name}}, {{designation}}, ...
// where the details go; this swaps them for the real values and keeps everything else (fonts, logo, layout) as it was.
// Word often splits one placeholder across several "runs" of text when the formatting changes mid-word, so the text of each
// paragraph is joined, edited as a whole, and put back into the same runs. A piece written [[ ... {{ctc}} ... ]] is dropped
// when a detail inside it is empty. Values are only ever inserted as text (XML-escaped), and what was inserted is never
// scanned again, so a value can't add or run placeholders of its own.
//
// {{signature}} and {{seal}} are pictures: they become the admin's signature and company seal images, placed at the end of
// the paragraph they are in (so put each on a line of its own). They work in the letter's body, not in headers or footers.

export type ImageKind = "signature" | "seal";
export const IMAGE_KINDS: ImageKind[] = ["signature", "seal"];
const KNOWN = new Set([...TEMPLATE_PLACEHOLDERS.map((p) => p.key), ...IMAGE_KINDS]);
const MAX_PART_BYTES = 20 * 1024 * 1024;

const P_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const T_RE = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The parts of a .docx that can hold letter text. */
const isTextPart = (name: string) => name === "word/document.xml" || /^word\/(header|footer)\d*\.xml$/.test(name);

type Run = { open: string; text: string };

function runsOf(paragraph: string): { runs: Run[]; matches: RegExpMatchArray[] } {
  const matches = [...paragraph.matchAll(T_RE)];
  const runs = matches.map((m) => {
    const open = m[0].slice(0, m[0].indexOf(">") + 1);
    return { open, text: decode(m[0].slice(open.length, m[0].length - "</w:t>".length)) };
  });
  return { runs, matches };
}

/** Replace the characters [start, end) of the joined text with `replacement`, keeping the runs. */
function replaceSpan(runs: Run[], start: number, end: number, replacement: string) {
  let pos = 0;
  let first = -1;
  let last = -1;
  const starts: number[] = [];
  for (const [i, r] of runs.entries()) {
    starts.push(pos);
    if (first < 0 && start < pos + r.text.length) first = i;
    if (end - 1 < pos + r.text.length && last < 0) last = i;
    pos += r.text.length;
  }
  if (first < 0 || last < 0) return;
  if (first === last) {
    runs[first].text = runs[first].text.slice(0, start - starts[first]) + replacement + runs[first].text.slice(end - starts[first]);
    return;
  }
  runs[first].text = runs[first].text.slice(0, start - starts[first]) + replacement;
  for (let k = first + 1; k < last; k++) runs[k].text = "";
  runs[last].text = runs[last].text.slice(end - starts[last]);
}

const joined = (runs: Run[]) => runs.map((r) => r.text).join("");
const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** A picture ready to be placed in the letter (size in pixels at 96 dpi). */
export type DocxImage = { rId: string; width: number; height: number; id: number; name: string };

const EMU = 9525;
function drawingRun(img: DocxImage): string {
  const cx = img.width * EMU;
  const cy = img.height * EMU;
  return (
    `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${img.id}" name="${img.name}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${img.id}" name="${img.name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${img.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/**
 * Fill one paragraph (its XML). Paragraphs with no {{ }} or [[ ]] are returned untouched. `images` are the pictures that
 * {{signature}} / {{seal}} turn into; without them those two placeholders are simply removed.
 */
export function fillParagraph(paragraph: string, values: Record<string, string>, images: Partial<Record<ImageKind, DocxImage>> = {}): string {
  const { runs, matches } = runsOf(paragraph);
  if (runs.length === 0 || !/\{\{|\[\[/.test(joined(runs))) return paragraph;

  // 1. Optional pieces: drop the whole [[ ... ]] when a detail inside is empty, otherwise just the brackets.
  for (let guard = 0; guard < 200; guard++) {
    const m = /\[\[(.*?)\]\]/.exec(joined(runs));
    if (!m) break;
    const keys = [...m[1].matchAll(PLACEHOLDER)].map((x) => x[1]);
    const empty = keys.some((k) => !IMAGE_KINDS.includes(k as ImageKind) && !(values[k] ?? "").trim());
    replaceSpan(runs, m.index, m.index + m[0].length, empty ? "" : m[1]);
  }

  // 2. Details: left to right, never re-reading what was just inserted. Picture placeholders are removed here and the
  //    pictures are added at the end of the paragraph below.
  const pictures: ImageKind[] = [];
  let from = 0;
  for (let guard = 0; guard < 500; guard++) {
    PLACEHOLDER.lastIndex = from;
    const m = PLACEHOLDER.exec(joined(runs));
    if (!m) break;
    const isImage = IMAGE_KINDS.includes(m[1] as ImageKind);
    if (isImage) pictures.push(m[1] as ImageKind);
    const value = isImage ? "" : (values[m[1]] ?? "");
    replaceSpan(runs, m.index, m.index + m[0].length, value);
    from = m.index + value.length;
  }

  // Put the text back into the same <w:t> elements.
  let out = "";
  let cursor = 0;
  matches.forEach((m, i) => {
    const run = runs[i];
    const open = /xml:space=/.test(run.open) || !/^\s|\s$/.test(run.text) ? run.open : run.open.replace(/>$/, ' xml:space="preserve">');
    out += paragraph.slice(cursor, m.index) + open + encode(run.text) + "</w:t>";
    cursor = m.index! + m[0].length;
  });
  out += paragraph.slice(cursor);

  const drawings = pictures.map((k) => (images[k] ? drawingRun(images[k]!) : "")).join("");
  return drawings ? out.replace(/<\/w:p>$/, `${drawings}</w:p>`) : out;
}

async function load(bytes: Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes);
  for (const [name, file] of Object.entries(zip.files)) {
    // JSZip records the size each part will have once unpacked; refuse a "zip bomb" before unpacking anything.
    const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (isTextPart(name) && size > MAX_PART_BYTES) throw new Error("The template is too large.");
  }
  return zip;
}

/** Which {{details}} a Word template uses, and which of them aren't ones we know (a typo, usually). */
export async function docxPlaceholders(bytes: Uint8Array): Promise<{ found: string[]; unknown: string[] }> {
  const zip = await load(bytes);
  const keys = new Set<string>();
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    const xml = await zip.file(name)!.async("string");
    for (const p of xml.match(P_RE) ?? []) {
      const text = joined(runsOf(p).runs);
      for (const m of text.matchAll(PLACEHOLDER)) keys.add(m[1]);
    }
  }
  const all = [...keys];
  return { found: all.filter((k) => KNOWN.has(k)), unknown: all.filter((k) => !KNOWN.has(k)) };
}

const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

/** Add the pictures to the package (media files, relationships, the .png content type). Returns what fillParagraph needs. */
async function addImages(zip: JSZip, pictures: Partial<Record<ImageKind, Uint8Array>>): Promise<Partial<Record<ImageKind, DocxImage>>> {
  const out: Partial<Record<ImageKind, DocxImage>> = {};
  const relsPath = "word/_rels/document.xml.rels";
  let rels = (await zip.file(relsPath)?.async("string")) ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let added = false;
  for (const [i, kind] of IMAGE_KINDS.entries()) {
    const bytes = pictures[kind];
    const size = bytes ? pngSize(bytes) : null;
    if (!bytes || !size) continue;
    const box = kind === "signature" ? fitInside(size, 170, 64) : fitInside(size, 104, 104);
    const rId = `rIdVyntics${kind}`;
    const target = `media/vyntics-${kind}.png`;
    zip.file(`word/${target}`, bytes);
    if (!rels.includes(`Id="${rId}"`)) {
      rels = rels.replace("</Relationships>", `<Relationship Id="${rId}" Type="${REL_TYPE}" Target="${target}"/></Relationships>`);
      added = true;
    }
    out[kind] = { rId, width: box.width, height: box.height, id: 9100 + i, name: `${kind}.png` };
  }
  if (added) zip.file(relsPath, rels);
  if (Object.keys(out).length > 0) {
    const ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct && !/Extension="png"/i.test(ct)) zip.file("[Content_Types].xml", ct.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="png" ContentType="image/png"/>`));
  }
  return out;
}

/** The template with every detail filled in, as a new .docx. `pictures` are PNG bytes for {{signature}} and {{seal}}. */
export async function fillDocx(bytes: Uint8Array, values: Record<string, string>, pictures: Partial<Record<ImageKind, Uint8Array>> = {}): Promise<Uint8Array> {
  const zip = await load(bytes);
  const images = await addImages(zip, pictures);
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    const xml = await zip.file(name)!.async("string");
    const body = name === "word/document.xml";
    const filled = xml.replace(P_RE, (p) => fillParagraph(p, values, body ? images : {}));
    if (filled !== xml) zip.file(name, filled);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
