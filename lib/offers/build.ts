import { CLAUSE_FIELDS, DEFAULT_CLAUSES, fillClause, type ClauseKey } from "./clauses";
import { isInternship, type CompanyInfo, type LetterBlock, type LetterData, type LetterDoc, type Phase } from "./types";

// Builds the structured letter (the master template) from the details, the company and the clause wording. The preview on
// screen and the PDF both draw this same structure, so they always agree. The rules about which clauses, table rows and
// annexures a letter has for each engagement type live here, not in the editable wording.

const longDate = (ymd: string) =>
  ymd ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`)) : "";

/** Money as "INR 12,000". An amount of 0 only happens in the preview of a form that is not finished, and reads "INR [amount]". */
export const inr = (n: number | string) => (Number(n) === 0 ? "INR [amount]" : `INR ${Number(n).toLocaleString("en-IN")}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const range = (p: Pick<Phase, "startDate" | "endDate">) => `${longDate(p.startDate)} to ${longDate(p.endDate)}`;

const SUBTITLE = {
  unpaid_internship: () => "UNPAID INTERNSHIP",
  paid_internship: (d: LetterData) => `PAID INTERNSHIP WITH A MONTHLY STIPEND${d.ppoConsideration ? " AND PPO CONSIDERATION" : ""}`,
  phased_internship: (d: LetterData) => `INTERNSHIP${d.phases.some((p) => p.isPaid) ? " WITH PERFORMANCE-BASED STIPEND" : ""}${d.ppoConsideration ? " AND PPO CONSIDERATION" : ""}`,
  full_time: () => "FULL-TIME EMPLOYMENT",
} as const;

/** The details a clause can use as {{name}}. */
export function clauseVars(d: LetterData, company: CompanyInfo): Record<string, string> {
  const paidAny = d.phases.some((p) => p.isPaid);
  const first = d.phases[0];
  const last = d.phases[d.phases.length - 1];
  const probation = Number(d.probationMonths);
  return {
    name: d.candidateName,
    firstName: d.candidateName.split(" ")[0] ?? "",
    company: company.name,
    designation: d.designation,
    joiningDate: longDate(d.joiningDate),
    workLocation: d.workLocation,
    reportingManager: d.reportingManager,
    noticeDays: d.noticeDays,
    nonCircumventionMonths: d.nonCircumventionMonths,
    probationMonths: plural(probation, "month", "months"),
    ctc: d.ctc ? inr(d.ctc) : "",
    engagementWord: isInternship(d.engagementType) ? "internship" : "employment",
    inLieu: paidAny ? " (and, during a paid period, stipend in lieu of notice)" : "",
    periodStart: first ? longDate(first.startDate) : "",
    periodEnd: last ? longDate(last.endDate) : "",
    phaseCount: NUMBER_WORDS[d.phases.length] ?? String(d.phases.length),
    phaseList: list(d.phases.map((p) => `${p.name} (${range(p)}, ${p.isPaid ? "paid" : "unpaid"})`)),
    stipend: first?.isPaid ? `${inr(first.monthlyAmount)} per month` : "",
    phaseMoney: d.phases
      .map((p) => (p.isPaid ? `In ${p.name}, your stipend is ${inr(p.monthlyAmount)} per month.` : `${p.name} is unpaid and no stipend is payable for it.`))
      .join(" "),
    ppoOutcome: d.ppoConsideration ? "; PPO, extension, or completion of engagement (after the final phase)" : "",
  };
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const paras = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export function buildLetter(data: LetterData, company: CompanyInfo, standard: Record<ClauseKey, string> = DEFAULT_CLAUSES): LetterDoc {
  const vars = clauseVars(data, company);
  // The company wording, with anything changed for this one letter on top.
  const own = Object.fromEntries(Object.entries(data.clauseOverrides ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
  const clauses = { ...standard, ...own };
  const say = (key: ClauseKey) => paras(fillClause(clauses[key], vars));
  const type = data.engagementType;
  const intern = isInternship(type);
  const blocks: LetterBlock[] = [];

  const intro = type === "full_time" ? "intro_full_time" : type === "phased_internship" ? "intro_phased" : "intro_internship";
  blocks.push(...say(intro).map((text): LetterBlock => ({ t: "para", text, key: intro })));

  // ---- Key terms ----
  const rowPhase: (number | null)[] = [];
  const rows: string[][] = [
    ["Company", company.gstin ? `${company.name.toUpperCase()}, GSTIN ${company.gstin}` : company.name.toUpperCase()],
    ["Role", data.designation],
    ["Joining Date", longDate(data.joiningDate)],
  ];
  if (type === "unpaid_internship" || type === "paid_internship") {
    const p = data.phases[0];
    rows.push(["Engagement Period", range(p)]);
    rows.push(["Stipend", p.isPaid ? `${inr(p.monthlyAmount)} per month, subject to applicable statutory deductions, if any` : "Unpaid"]);
    rowPhase[rows.length - 2] = 0;
    rowPhase[rows.length - 1] = 0;
  } else if (type === "phased_internship") {
    for (const [n, p] of data.phases.entries()) {
      rows.push([`Phase ${n + 1}`, `${p.name}: ${range(p)}${p.isPaid ? "" : " (unpaid)"}`]);
      rowPhase[rows.length - 1] = n;
    }
    rows.push(["Stipend", data.phases.map((p, n) => `Phase ${n + 1}: ${p.isPaid ? `${inr(p.monthlyAmount)} per month` : "unpaid"}`).join(". ") + (data.phases.some((p) => p.isPaid) ? ", subject to applicable statutory deductions, if any" : "")]);
  } else {
    rows.push(["Annual CTC", inr(data.ctc)]);
    if (Number(data.probationMonths) > 0) rows.push(["Probation", plural(Number(data.probationMonths), "month", "months")]);
    rows.push(["Notice Period", plural(Number(data.noticeDays), "day", "days")]);
  }
  rows.push(["Work Location", data.workLocation]);
  if (data.reportingManager) rows.push(["Reporting To", data.reportingManager]);
  // For one-period internships there is no annexure, so the PPO note sits here.
  if (data.ppoConsideration && (type === "unpaid_internship" || type === "paid_internship")) rows.push(["Indicative Full-Time Compensation", say("ppo_row").join(" ")]);
  blocks.push({ t: "heading", text: "KEY ENGAGEMENT TERMS" }, { t: "table", rows, widths: [30, 70], rowPhase: rows.map((_, i) => rowPhase[i] ?? null) });

  // ---- Terms and conditions ----
  blocks.push({ t: "heading", text: "TERMS AND CONDITIONS" });
  let n = 0;
  const clause = (title: string, key: ClauseKey | ClauseKey[]) => {
    const keys = Array.isArray(key) ? key : [key];
    const body = keys.flatMap(say);
    const owners = keys.flatMap((k) => say(k).map(() => k));
    if (body.length > 0) blocks.push({ t: "clause", n: ++n, title, paras: body, keys: owners });
  };

  if (type === "phased_internship") clause("Internship Phases And Evaluation", data.ppoConsideration ? ["phases_intro", "phases_evaluation", "phases_ppo"] : ["phases_intro", "phases_evaluation"]);
  else if (intern) clause("Engagement Period", "engagement_period");
  else clause("Employment Period", "employment_period");

  clause("Responsibilities", "responsibilities");

  if (type === "unpaid_internship") clause("Unpaid Internship", "stipend_unpaid");
  else if (type === "paid_internship") clause("Stipend And Deductions", "stipend_paid");
  else if (type === "phased_internship") clause("Stipend And Deductions", "stipend_phased");
  else clause("Salary And Deductions", "salary");

  clause("Confidentiality And Client Information", "confidentiality");
  clause("Intellectual Property", "intellectual_property");
  clause("Code Of Ethics And Professional Conduct", "ethics");
  if (Number(data.nonCircumventionMonths) > 0) clause("Client Non Circumvention", "non_circumvention");
  if (data.includeOutsideWorkClause) clause("Outside Work", "outside_work");

  if (type === "full_time") {
    if (Number(data.probationMonths) > 0) clause("Probation", "probation");
    clause("Working Hours And Availability", "working_hours");
    clause("Leave", "leave");
  } else {
    clause("Attendance Leave And Availability", "attendance");
  }
  clause(intern ? "Ending The Internship" : "Ending Your Employment", "ending");
  clause("Return Of Property And Access", "return_property");

  // ---- Acceptance ----
  blocks.push({ t: "heading", text: "ACCEPTANCE" });
  blocks.push(...say("acceptance_intro").map((text): LetterBlock => ({ t: "para", text, key: "acceptance_intro" })));
  blocks.push({
    t: "acceptance",
    company: company.name,
    signatoryName: company.signatoryName || "Authorised Signatory",
    signatoryTitle: company.signatoryTitle,
    letterDate: longDate(data.letterDate),
    candidateName: data.candidateName,
  });

  // ---- Annexure A ----
  if (type === "phased_internship") {
    const annex: string[][] = [];
    const annexPhase: (number | null)[] = [];
    for (const [i, p] of data.phases.entries()) {
      annex.push([`Phase ${i + 1} (${p.isPaid ? "Paid" : "Unpaid"})`, `${range(p)} - ${p.isPaid ? `${inr(p.monthlyAmount)} per month` : "no stipend"}`]);
      annexPhase[annex.length - 1] = i;
    }
    for (const [i, p] of data.phases.entries())
      if (p.evaluationWindow) {
        annex.push([`Phase ${i + 1} Evaluation Window`, p.evaluationWindow]);
        annexPhase[annex.length - 1] = i;
      }
    annex.push(["Possible Outcome", say("outcome").join(" ")]);
    if (data.ppoConsideration) annex.push(["Indicative Full-Time Compensation", say("ppo_row").join(" ")]);
    blocks.push({ t: "annexureTitle", text: "Annexure A - Stipend And Internship Details" }, { t: "table", header: ["Particular", "Details"], rows: annex, widths: [30, 70], rowPhase: annex.map((_, i) => annexPhase[i] ?? null) });
  } else if (type === "full_time") {
    const lines = data.salaryBreakup;
    const monthlyTotal = lines.reduce((s, l) => s + Number(l.monthly), 0);
    const table: string[][] = lines.length
      ? [...lines.map((l) => [l.label, inr(l.monthly), inr(Number(l.monthly) * 12)]), ["Total (CTC)", inr(monthlyTotal), inr(monthlyTotal * 12)]]
      : [["Cost to company (CTC)", inr(Math.round(Number(data.ctc) / 12)), inr(data.ctc)]];
    blocks.push({ t: "annexureTitle", text: "Annexure A - Salary Breakup" }, { t: "table", header: ["Component", "Monthly", "Annual"], rows: table, widths: [50, 25, 25], align: ["left", "right", "right"], boldLastRow: true });
  }

  if (company.registeredAddress) blocks.push({ t: "note", text: `Registered Address: ${company.registeredAddress}` });

  return {
    title: "OFFER AND APPOINTMENT LETTER",
    subtitle: SUBTITLE[type](data),
    company: company.name,
    gstin: company.gstin,
    city: company.city,
    date: longDate(data.letterDate),
    party: [`${data.candidateName},`, data.candidateAddress, data.candidateEmail && `Email: ${data.candidateEmail}`, data.candidatePhone && `Phone: ${data.candidatePhone}`].filter(Boolean) as string[],
    subject: intern ? "Internship Offer & Appointment Letter" : "Employment Offer & Appointment Letter",
    salutation: `Dear ${vars.firstName},`,
    blocks,
  };
}

/** Where each clause piece shows up, for the settings screen. */
export const CLAUSE_USED = Object.fromEntries(CLAUSE_FIELDS.map((c) => [c.key, c.used]));
