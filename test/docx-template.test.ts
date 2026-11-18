import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { docxPlaceholders, fillDocx, fillParagraph } from "@/lib/documents/docxTemplate";
import { checkOffer, offerDefaults, placeholderValues } from "@/lib/documents/offerLetter";
import { detectKind } from "@/lib/documents/sniff";

const r = checkOffer({ ...offerDefaults("2026-11-18", "Asha Rao"), designation: "Engineer", ctc: "₹ 6,00,000 per year", signatoryName: "Priya Shah" });
if (!r.ok) throw new Error("setup");
const values = placeholderValues(r.data);

const p = (...runs: string[]) => `<w:p><w:pPr/>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r>`).join("")}</w:p>`;
const text = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

async function makeDocx(body: string, extra: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
  for (const [name, xml] of Object.entries(extra)) zip.file(name, xml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("fillParagraph", () => {
  it("fills a placeholder in one run", () => {
    expect(text(fillParagraph(p("Dear {{name}},"), values))).toBe("Dear Asha Rao,");
  });
  it("fills a placeholder that Word split across runs, keeping the first run's formatting", () => {
    const out = fillParagraph(p("Dear {{na", "me}}, welcome"), values);
    expect(text(out)).toBe("Dear Asha Rao, welcome");
    expect(out).toContain("<w:b/>");
  });
  it("accepts spaces inside the braces and several placeholders", () => {
    expect(text(fillParagraph(p("{{ name }} joins {{company}} as {{designation}}"), values))).toBe("Asha Rao joins Vyntics as Engineer");
  });
  it("keeps or drops an optional [[ piece ]] depending on whether its detail is empty", () => {
    expect(text(fillParagraph(p("Pay[[: {{ctc}}]]."), values))).toBe("Pay: INR 6,00,000 per year.");
    expect(text(fillParagraph(p("Pay[[: {{ctc}}]]."), { ...values, ctc: "" }))).toBe("Pay.");
    expect(text(fillParagraph(p("Pay[[: {{c", "tc}}]]."), { ...values, ctc: "" }))).toBe("Pay.");
  });
  it("escapes values and never re-reads what it inserted", () => {
    const sneaky = { ...values, name: "A & B <x> {{company}} [[z]]" };
    const out = fillParagraph(p("Dear {{name}}, from {{company}}"), sneaky);
    expect(out).toContain("A &amp; B &lt;x&gt; {{company}} [[z]]");
    expect(text(out)).toBe("Dear A &amp; B &lt;x&gt; {{company}} [[z]], from Vyntics");
  });
  it("preserves spaces at the ends of a run and leaves other paragraphs alone", () => {
    expect(fillParagraph(p("Hello {{name}} "), values)).toContain('xml:space="preserve"');
    const plain = p("Nothing to fill here");
    expect(fillParagraph(plain, values)).toBe(plain);
  });
  it("decodes and re-encodes text it passes through", () => {
    expect(text(fillParagraph(p("Terms &amp; conditions: {{name}}"), values))).toBe("Terms &amp; conditions: Asha Rao");
  });
});

describe("docx files", () => {
  it("lists the details a template uses and flags unknown ones", async () => {
    const docx = await makeDocx(p("Dear {{name}}, {{desig", "nation}} {{nme}}"), { "word/footer1.xml": `<w:ftr>${p("{{company}}")}</w:ftr>` });
    expect(await docxPlaceholders(docx)).toEqual({ found: ["name", "designation", "company"], unknown: ["nme"] });
  });
  it("fills the body and the footer, and still looks like a real .docx", async () => {
    const docx = await makeDocx(p("Dear {{name}},"), { "word/footer1.xml": `<w:ftr>${p("{{company}}")}</w:ftr>` });
    const out = await fillDocx(docx, values);
    expect(await detectKind(out)).toBe("docx");
    const zip = await JSZip.loadAsync(out);
    expect(text(await zip.file("word/document.xml")!.async("string"))).toBe("Dear Asha Rao,");
    expect(text(await zip.file("word/footer1.xml")!.async("string"))).toBe("Vyntics");
    expect(Object.keys(zip.files)).toContain("[Content_Types].xml");
  });
});
