import { describe, expect, it } from "vitest";
import { DEFAULT_OFFER_TEMPLATE, checkOffer, checkTemplate, offerDefaults, offerLetter, previewFields } from "@/lib/documents/offerLetter";

const TODAY = "2026-11-18";
const good = { ...offerDefaults(TODAY, "Asha Rao"), designation: "Software Engineer", department: "Engineering", location: "Pune", ctc: "₹ 8,00,000 per year", reportingTo: "Ravi Menon", signatoryName: "Priya Shah" };
const fields = () => {
  const r = checkOffer(good);
  if (!r.ok) throw new Error("setup");
  return r.data;
};
const text = (l: ReturnType<typeof offerLetter>) => l.blocks.flat().join("\n");

describe("offer letter details", () => {
  it("starts from sensible defaults with the employee's name", () => {
    expect(offerDefaults(TODAY, "Asha Rao")).toMatchObject({ name: "Asha Rao", company: "Vyntics", probationMonths: "3", noticeDays: "30", issueDate: TODAY, acceptBy: "2026-11-25", joiningDate: "2026-12-02" });
  });
  it("accepts good details and writes the rupee sign as INR", () => {
    expect(fields().ctc).toBe("INR 8,00,000 per year");
  });
  it("needs a name, job title and company, and valid dates and numbers", () => {
    expect(checkOffer({ ...good, name: " " })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, designation: "" })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, joiningDate: "2026-13-40" })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, acceptBy: "2026-11-01" })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, probationMonths: "x" })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, probationMonths: "13" })).toMatchObject({ ok: false });
    expect(checkOffer({ ...good, noticeDays: "999" })).toMatchObject({ ok: false });
  });
  it("strips control characters and limits length", () => {
    const r = checkOffer({ ...good, name: "Asha\u0000\nRao", designation: "x".repeat(500) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Asha Rao");
      expect(r.data.designation).toHaveLength(120);
    }
  });
});

describe("the default template", () => {
  const l = offerLetter(fields());
  it("is valid", () => {
    expect(checkTemplate(DEFAULT_OFFER_TEMPLATE)).toMatchObject({ ok: true });
  });
  it("fills in the details", () => {
    expect(l.recipient).toBe("Asha Rao");
    expect(l.date).toBe("18 November 2026");
    expect(l.subject).toBe("Offer of employment: Software Engineer");
    expect(l.blocks[0]).toEqual(["Dear Asha Rao,"]);
    expect(text(l)).toContain("Software Engineer at Vyntics, in the Engineering department, based at Pune");
    expect(text(l)).toContain("begin on 2 December 2026, and you will report to Ravi Menon.");
    expect(text(l)).toContain("INR 8,00,000 per year");
    expect(text(l)).toContain("probation for 3 months");
    expect(text(l)).toContain("30 days written notice");
    expect(text(l)).toContain("this letter by 25 November 2026 to confirm");
    expect(l.signatory).toBe("Priya Shah");
    expect(l.acceptance[0][0]).toBe("Acceptance");
    expect(l.acceptance[0][1]).toBe("I, Asha Rao, accept the offer of employment on the terms above.");
  });
  it("leaves out pieces for details that are empty", () => {
    const bare = checkOffer({ ...good, department: "", location: "", reportingTo: "", ctc: "", probationMonths: "0", noticeDays: "", acceptBy: "", signatoryName: "", signatoryTitle: "" });
    if (!bare.ok) throw new Error("setup");
    const b = offerLetter(bare.data);
    expect(text(b)).toContain("the position of Software Engineer at Vyntics. We were impressed");
    expect(text(b)).toContain("begin on 2 December 2026.");
    expect(text(b)).not.toContain("compensation");
    expect(text(b)).not.toContain("probation");
    expect(text(b)).not.toContain("notice");
    expect(text(b)).toContain("this letter to confirm");
    expect(b.signatory).toBe("Authorised Signatory");
    expect(b.blocks.at(-1)).toEqual(["Yours sincerely,", "[space]", "Authorised Signatory", "Vyntics"]);
  });
  it("keeps the wording fixed whatever is typed in a detail (it is only ever data)", () => {
    const sneaky = checkOffer({ ...good, name: "Asha. {{company}} [[x]] ---" });
    if (!sneaky.ok) throw new Error("setup");
    const s = offerLetter(sneaky.data);
    expect(s.blocks[0][0]).toBe("Dear Asha. {{company}} [[x]] ---,");
    expect(s.acceptance).toHaveLength(1);
  });
  it("shows labels for blanks in the preview", () => {
    expect(previewFields({ ...good, name: "", designation: "" })).toMatchObject({ name: "[Name]", designation: "[Job title]" });
  });
});

describe("a custom template", () => {
  const custom = `Subject: Welcome, {{name}}

Dear {{name}},

You join {{company}} as {{designation}} on {{joiningDate}}.

[[Pay: {{ctc}}.]]

Regards,
{{signatoryName}}
---
Sign here: ____`;
  it("is used instead of the default", () => {
    const c = checkTemplate(custom);
    expect(c.ok).toBe(true);
    const l = offerLetter(fields(), custom);
    expect(l.subject).toBe("Welcome, Asha Rao");
    expect(l.blocks).toEqual([["Dear Asha Rao,"], ["You join Vyntics as Software Engineer on 2 December 2026."], ["Pay: INR 8,00,000 per year."], ["Regards,", "Priya Shah"]]);
    expect(l.acceptance).toEqual([["Sign here: ____"]]);
  });
  it("rejects a template with a mistake, saying what is wrong", () => {
    expect(checkTemplate("short")).toMatchObject({ ok: false });
    expect(checkTemplate("Dear {{nme}}, welcome to the team at our company today.")).toEqual({ ok: false, error: "Unknown detail {{nme}}. Use the buttons to add details." });
    expect(checkTemplate("Dear {{name}, welcome to the team at our company today.")).toMatchObject({ ok: false });
    expect(checkTemplate("Dear {{name}}, [[ welcome to the team at our company today.")).toMatchObject({ ok: false, error: expect.stringContaining("Line 1") });
    expect(checkTemplate("Dear {{name}}, [[a [[b]] c]] welcome to the team at our company.")).toMatchObject({ ok: false });
    expect(checkTemplate("x".repeat(6001))).toMatchObject({ ok: false });
  });
  it("cleans control characters and the rupee sign", () => {
    const c = checkTemplate("Dear {{name}},\u0007 your pay is ₹ 5 per month, welcome aboard.");
    expect(c).toEqual({ ok: true, data: "Dear {{name}}, your pay is INR 5 per month, welcome aboard." });
  });
});
