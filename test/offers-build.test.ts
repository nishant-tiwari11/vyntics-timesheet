import { describe, expect, it } from "vitest";
import { buildLetter } from "@/lib/offers/build";
import { checkLetter } from "@/lib/offers/check";
import { DEFAULT_CLAUSES, mergeClauses } from "@/lib/offers/clauses";
import { emptyLetter, type CompanyInfo, type LetterBlock, type LetterData } from "@/lib/offers/types";

const company: CompanyInfo = {
  name: "Vyntics",
  gstin: "08EIGPM6800Q1ZN",
  registeredAddress: "Building/Flat 72, Agra Road, Jaipur, Rajasthan 302031",
  city: "Jaipur Rajasthan",
  signatoryName: "Arun Mudgal",
  signatoryTitle: "Founder",
};

const base = {
  ...emptyLetter("2026-10-23"),
  candidateName: "Nishant Tiwari",
  candidateAddress: "Near Sarvoday Convent School, Kota, Rajasthan - 324001",
  candidateEmail: "Nishant1122005@gmail.com",
  candidatePhone: "7073896499",
  reportingManager: "Arun Mudgal",
  joiningDate: "2026-10-19",
  designation: "Intern",
};
const phased = {
  ...base,
  engagementType: "phased_internship",
  ppoConsideration: true,
  phases: [
    { name: "Phase 1", startDate: "2026-10-19", endDate: "2027-01-18", isPaid: false, monthlyAmount: "", evaluationWindow: "January 2027" },
    { name: "Phase 2", startDate: "2027-01-19", endDate: "2027-07-18", isPaid: true, monthlyAmount: "12,000", evaluationWindow: "July 2027" },
  ],
};
const paidOne = { ...base, engagementType: "paid_internship", phases: [{ name: "Internship", startDate: "2026-10-19", endDate: "2027-04-18", isPaid: true, monthlyAmount: "10000", evaluationWindow: "" }] };
const unpaidOne = { ...base, engagementType: "unpaid_internship", ppoConsideration: false, phases: [{ name: "Internship", startDate: "2026-10-19", endDate: "2027-01-18", isPaid: false, monthlyAmount: "", evaluationWindow: "" }] };
const fullTime = {
  ...base,
  engagementType: "full_time",
  designation: "Software Engineer",
  ctc: "600000",
  probationMonths: "3",
  noticeDays: "30",
  salaryBreakup: [
    { label: "Basic", monthly: "30000" },
    { label: "HRA", monthly: "15000" },
    { label: "Special allowance", monthly: "5000" },
  ],
};

const make = (input: unknown): LetterData => {
  const r = checkLetter(input);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const doc = (input: unknown, clauses = DEFAULT_CLAUSES) => buildLetter(make(input), company, clauses);
const clauseTitles = (d: ReturnType<typeof doc>) => d.blocks.filter((b): b is Extract<LetterBlock, { t: "clause" }> => b.t === "clause").map((b) => `${b.n}. ${b.title}`);
const allText = (d: ReturnType<typeof doc>) =>
  d.blocks.flatMap((b) => (b.t === "clause" ? [b.title, ...b.paras] : b.t === "table" ? [...(b.header ?? []), ...b.rows.flat()] : b.t === "para" || b.t === "heading" || b.t === "annexureTitle" || b.t === "note" ? [b.text] : [])).join("\n");
const tables = (d: ReturnType<typeof doc>) => d.blocks.filter((b): b is Extract<LetterBlock, { t: "table" }> => b.t === "table");

describe("checking the details", () => {
  it("accepts a good letter of each type", () => {
    for (const x of [phased, paidOne, unpaidOne, fullTime]) expect(checkLetter(x).ok).toBe(true);
  });

  it("needs the basics", () => {
    expect(checkLetter({ ...phased, candidateName: " " }).ok).toBe(false);
    expect(checkLetter({ ...phased, designation: "" }).ok).toBe(false);
    expect(checkLetter({ ...phased, joiningDate: "soon" }).ok).toBe(false);
    expect(checkLetter({ ...phased, workLocation: "Moon" }).ok).toBe(false);
    expect(checkLetter({ ...phased, engagementType: "contractor" }).ok).toBe(false);
    expect(checkLetter({ ...phased, candidateEmail: "nope" }).ok).toBe(false);
    expect(checkLetter({ ...phased, noticeDays: "400" }).ok).toBe(false);
  });

  it("checks the phases", () => {
    expect(checkLetter({ ...phased, phases: [] }).ok).toBe(false);
    expect(checkLetter({ ...phased, phases: [phased.phases[0]] }).ok).toBe(false); // phased needs two or more
    expect(checkLetter({ ...phased, phases: [phased.phases[1], phased.phases[0]] }).ok).toBe(false); // out of order
    expect(checkLetter({ ...phased, phases: [{ ...phased.phases[0], endDate: "2026-01-01" }, phased.phases[1]] }).ok).toBe(false);
    expect(checkLetter({ ...phased, phases: [phased.phases[0], { ...phased.phases[1], monthlyAmount: "" }] }).ok).toBe(false); // paid, no amount
    expect(checkLetter({ ...paidOne, phases: [{ ...paidOne.phases[0], monthlyAmount: "abc" }] }).ok).toBe(false);
    expect(checkLetter({ ...unpaidOne, phases: [unpaidOne.phases[0], unpaidOne.phases[0]] }).ok).toBe(false); // one period only
  });

  it("forces the unpaid type to be unpaid and the paid type to be paid", () => {
    const u = make({ ...unpaidOne, phases: [{ ...unpaidOne.phases[0], isPaid: true, monthlyAmount: "999" }] });
    expect(u.phases[0]).toMatchObject({ isPaid: false, monthlyAmount: "" });
    expect(make(paidOne).phases[0]).toMatchObject({ isPaid: true, monthlyAmount: "10000" });
  });

  it("checks full-time pay, and that the breakup adds up to the CTC", () => {
    expect(checkLetter({ ...fullTime, ctc: "" }).ok).toBe(false);
    expect(checkLetter({ ...fullTime, probationMonths: "20" }).ok).toBe(false);
    const bad = checkLetter({ ...fullTime, ctc: "700000" });
    expect(bad.ok).toBe(false);
    expect(bad.ok ? "" : bad.error).toMatch(/add up to INR 6,00,000 a year/);
    expect(checkLetter({ ...fullTime, salaryBreakup: [] }).ok).toBe(true); // no breakup is allowed
    expect(make({ ...fullTime, ppoConsideration: true }).ppoConsideration).toBe(false); // PPO only means something for interns
  });
});

describe("the letter for each engagement type", () => {
  it("phased internship: phases clause with PPO, annexure with the phases, and the full-time compensation row", () => {
    const d = doc(phased);
    expect(d.subtitle).toBe("INTERNSHIP WITH PERFORMANCE-BASED STIPEND AND PPO CONSIDERATION");
    expect(d.party).toEqual(["Nishant Tiwari,", "Near Sarvoday Convent School, Kota, Rajasthan - 324001", "Email: Nishant1122005@gmail.com", "Phone: 7073896499"]);
    expect(d.salutation).toBe("Dear Nishant,");
    expect(clauseTitles(d)).toEqual([
      "1. Internship Phases And Evaluation",
      "2. Responsibilities",
      "3. Stipend And Deductions",
      "4. Confidentiality And Client Information",
      "5. Intellectual Property",
      "6. Code Of Ethics And Professional Conduct",
      "7. Client Non Circumvention",
      "8. Outside Work",
      "9. Attendance Leave And Availability",
      "10. Ending The Internship",
      "11. Return Of Property And Access",
    ]);
    const text = allText(d);
    expect(text).toContain("Pre-Placement Offer (PPO)");
    expect(text).toContain("Phase 1 (Unpaid)");
    expect(text).toContain("19 October 2026 to 18 January 2027 - no stipend");
    expect(text).toContain("19 January 2027 to 18 July 2027 - INR 12,000 per month");
    expect(text).toContain("Phase 2 Evaluation Window");
    expect(text).toContain("July 2027");
    expect(text).toContain("Indicative Full-Time Compensation");
    expect(text).toContain("for twenty four months".replace("twenty four", "24"));
    expect(text).toContain("7 days written notice (and, during a paid period, stipend in lieu of notice)");
    expect(text).toContain("Annexure A - Stipend And Internship Details");
    expect(text).toContain("Registered Address: Building/Flat 72");
  });

  it("phased internship without PPO leaves out the PPO paragraph, the row and the subtitle words", () => {
    const d = doc({ ...phased, ppoConsideration: false });
    const text = allText(d);
    expect(d.subtitle).toBe("INTERNSHIP WITH PERFORMANCE-BASED STIPEND");
    expect(text).not.toContain("Pre-Placement Offer");
    expect(text).not.toContain("Indicative Full-Time Compensation");
    expect(text).not.toContain("PPO, extension");
  });

  it("paid internship: Engagement Period clause, stipend clause, no annexure", () => {
    const d = doc(paidOne);
    expect(clauseTitles(d).slice(0, 3)).toEqual(["1. Engagement Period", "2. Responsibilities", "3. Stipend And Deductions"]);
    const text = allText(d);
    expect(text).toContain("INR 10,000 per month");
    expect(text).toContain("stipend in lieu of notice");
    expect(text).not.toContain("Annexure A");
    expect(text).not.toContain("Internship Phases");
    expect(tables(d)).toHaveLength(1);
  });

  it("unpaid internship: no stipend wording anywhere, and no stipend in lieu of notice", () => {
    const d = doc(unpaidOne);
    const text = allText(d);
    expect(clauseTitles(d)[2]).toBe("3. Unpaid Internship");
    expect(text).toContain("This is an unpaid internship");
    expect(text).not.toContain("in lieu of notice");
    expect(text).not.toContain("Indicative Full-Time Compensation");
    expect(tables(d)[0].rows).toContainEqual(["Stipend", "Unpaid"]);
  });

  it("full-time: salary clause, probation, working hours and leave, notice, and a salary breakup annexure", () => {
    const d = doc(fullTime);
    expect(d.subject).toBe("Employment Offer & Appointment Letter");
    expect(d.subtitle).toBe("FULL-TIME EMPLOYMENT");
    const titles = clauseTitles(d);
    expect(titles[0]).toBe("1. Employment Period");
    expect(titles).toContain("3. Salary And Deductions");
    expect(titles.some((t) => t.endsWith("Probation"))).toBe(true);
    expect(titles.some((t) => t.endsWith("Working Hours And Availability"))).toBe(true);
    expect(titles.some((t) => t.endsWith("Leave"))).toBe(true);
    expect(titles.some((t) => t.includes("Attendance Leave And Availability"))).toBe(false);
    expect(titles).toContain("12. Ending Your Employment");
    const text = allText(d);
    expect(text).toContain("INR 6,00,000");
    expect(text).toContain("30 days written notice");
    expect(text).not.toContain("in lieu of notice");
    expect(text).toContain("Annexure A - Salary Breakup");
    const annex = tables(d)[1];
    expect(annex.rows[annex.rows.length - 1]).toEqual(["Total (CTC)", "INR 50,000", "INR 6,00,000"]);
    expect(annex.header).toEqual(["Component", "Monthly", "Annual"]);
  });

  it("leaves out the outside-work clause and the non-circumvention clause when switched off", () => {
    const d = doc({ ...phased, includeOutsideWorkClause: false, nonCircumventionMonths: "0" });
    const titles = clauseTitles(d).join("|");
    expect(titles).not.toContain("Outside Work");
    expect(titles).not.toContain("Client Non Circumvention");
    expect(clauseTitles(d)).toHaveLength(9);
    expect(clauseTitles(d)[clauseTitles(d).length - 1]).toBe("9. Return Of Property And Access");
  });

  it("uses edited wording, and an empty piece falls back to the default", () => {
    const edited = mergeClauses({ responsibilities: "Do the work, {{firstName}}, for {{company}}.", ethics: "   " });
    const text = allText(doc(phased, edited));
    expect(text).toContain("Do the work, Nishant, for Vyntics.");
    expect(text).toContain("You are expected to act honestly"); // the empty edit fell back
  });

  it("writes the number of phases in words", () => {
    expect(allText(doc(phased))).toContain("structured in two phases");
  });

  it("only ever treats typed wording as text: a value can't add a detail of its own", () => {
    const sneaky = { ...phased, candidateName: "Evil {{company}}", designation: "{{ctc}}" };
    const d = doc(sneaky);
    expect(d.party[0]).toBe("Evil {{company}},"); // not replaced by the company name
    expect(allText(d)).toContain("{{ctc}}"); // the role stays as typed, not filled with a pay amount
  });
});

describe("the preview of an unfinished form", () => {
  it("draws a blank letter of every type with placeholders instead of failing", async () => {
    const { previewLetterData } = await import("@/lib/offers/defaults");
    for (const engagementType of ["unpaid_internship", "paid_internship", "phased_internship", "full_time"] as const) {
      const blank = { ...emptyLetter("2026-10-23"), engagementType, candidateName: "", designation: "", phases: [], ctc: "" };
      const d = buildLetter(previewLetterData(blank, "2026-10-23"), company);
      expect(d.party[0]).toBe("[Name],");
      expect(d.blocks.length).toBeGreaterThan(8);
    }
  });

  it("shows a paid phase with no amount as [amount], never as a real number", async () => {
    const { previewLetterData } = await import("@/lib/offers/defaults");
    const d = buildLetter(previewLetterData({ ...phased, phases: [phased.phases[0], { ...phased.phases[1], monthlyAmount: "" }] } as never, "2026-10-23"), company);
    expect(allText(d)).toContain("INR [amount] per month");
    // a real amount is unchanged
    expect(allText(doc(phased))).toContain("INR 12,000 per month");
  });
});
