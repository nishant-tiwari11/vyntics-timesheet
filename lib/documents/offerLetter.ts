// The offer letter. The wording comes from a TEMPLATE (plain text an admin can edit); the details (name, job title,
// start date, pay, ...) come from a form. The same function builds the on-screen preview and the PDF, so they never differ.
// Plain code with no server-only imports.

import { isYmd } from "@/lib/timesheet/dates";

export type OfferFields = {
  name: string;
  designation: string;
  department: string;
  location: string;
  /** YYYY-MM-DD */
  joiningDate: string;
  /** Free text, e.g. "INR 6,00,000 per year" */
  ctc: string;
  reportingTo: string;
  probationMonths: string;
  noticeDays: string;
  /** YYYY-MM-DD: the date on the letter */
  issueDate: string;
  /** YYYY-MM-DD: the date to sign and return by */
  acceptBy: string;
  company: string;
  companyAddress: string;
  signatoryName: string;
  signatoryTitle: string;
};

export const OFFER_FIELD_LABEL: Record<keyof OfferFields, string> = {
  name: "Employee name",
  designation: "Job title",
  department: "Department",
  location: "Work location",
  joiningDate: "Joining date",
  ctc: "Pay (CTC)",
  reportingTo: "Reports to",
  probationMonths: "Probation (months)",
  noticeDays: "Notice period (days)",
  issueDate: "Letter date",
  acceptBy: "Accept by",
  company: "Company name",
  companyAddress: "Company address",
  signatoryName: "Signed by",
  signatoryTitle: "Signatory's title",
};

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function offerDefaults(today: string, name = ""): OfferFields {
  return {
    name,
    designation: "",
    department: "",
    location: "",
    joiningDate: addDays(today, 14),
    ctc: "",
    reportingTo: "",
    probationMonths: "3",
    noticeDays: "30",
    issueDate: today,
    acceptBy: addDays(today, 7),
    company: "Vyntics",
    companyAddress: "",
    signatoryName: "",
    signatoryTitle: "HR Manager",
  };
}

/** Plain text only: control characters become spaces, the rupee sign is written "INR" (PDF fonts can't draw it), spaces tidied. */
const clean = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "")
    .replace(/₹/g, "INR ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);

export function checkOffer(input: Record<string, unknown>): { ok: true; data: OfferFields } | { ok: false; error: string } {
  const text = (k: keyof OfferFields, max = 120) => clean(input[k], max);
  const data: OfferFields = {
    name: text("name"),
    designation: text("designation"),
    department: text("department"),
    location: text("location"),
    joiningDate: text("joiningDate", 10),
    ctc: text("ctc"),
    reportingTo: text("reportingTo"),
    probationMonths: text("probationMonths", 2),
    noticeDays: text("noticeDays", 3),
    issueDate: text("issueDate", 10),
    acceptBy: text("acceptBy", 10),
    company: text("company"),
    companyAddress: text("companyAddress", 200),
    signatoryName: text("signatoryName"),
    signatoryTitle: text("signatoryTitle"),
  };
  for (const k of ["name", "designation", "company"] as const) if (!data[k]) return { ok: false, error: `Enter the ${OFFER_FIELD_LABEL[k].toLowerCase()}.` };
  for (const k of ["joiningDate", "issueDate"] as const) if (!isYmd(data[k])) return { ok: false, error: `Enter a valid ${OFFER_FIELD_LABEL[k].toLowerCase()}.` };
  if (data.acceptBy && !isYmd(data.acceptBy)) return { ok: false, error: "Enter a valid accept-by date." };
  if (data.acceptBy && data.acceptBy < data.issueDate) return { ok: false, error: "The accept-by date can't be before the letter date." };
  if (data.probationMonths && !/^\d{1,2}$/.test(data.probationMonths)) return { ok: false, error: "Probation must be a whole number of months." };
  if (data.probationMonths && Number(data.probationMonths) > 12) return { ok: false, error: "Probation can be up to 12 months." };
  if (data.noticeDays && !/^\d{1,3}$/.test(data.noticeDays)) return { ok: false, error: "Notice period must be a whole number of days." };
  if (data.noticeDays && Number(data.noticeDays) > 180) return { ok: false, error: "Notice period can be up to 180 days." };
  return { ok: true, data };
}

const longDate = (ymd: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
const dateText = (ymd: string) => (isYmd(ymd) ? longDate(ymd) : ymd);
const days = (n: string) => `${n} ${Number(n) === 1 ? "day" : "days"}`;
const months = (n: string) => `${n} ${Number(n) === 1 ? "month" : "months"}`;

// ---------------------------------------------------------------------------------------------------------------------
// The template: plain text an admin can edit (Admin -> Documents -> Offer letter). How it is written:
//   {{name}}                 a detail from the form (the list is TEMPLATE_PLACEHOLDERS)
//   [[ ... {{ctc}} ... ]]    an optional piece on one line: left out when a detail inside it is empty
//   a blank line             starts a new paragraph
//   Subject: ...             the first line is the subject
//   [space]                  a gap (room to sign)
//   ---                      what follows is the acceptance block at the bottom
// Anything else is printed as typed. It is only ever text: it can't run anything.
// ---------------------------------------------------------------------------------------------------------------------

export const TEMPLATE_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "name", label: "Employee name" },
  { key: "designation", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "location", label: "Work location" },
  { key: "joiningDate", label: "Joining date" },
  { key: "ctc", label: "Pay (CTC)" },
  { key: "reportingTo", label: "Reports to" },
  { key: "probation", label: "Probation (e.g. 3 months)" },
  { key: "notice", label: "Notice period (e.g. 30 days)" },
  { key: "issueDate", label: "Letter date" },
  { key: "acceptBy", label: "Accept-by date" },
  { key: "company", label: "Company name" },
  { key: "companyAddress", label: "Company address" },
  { key: "signatoryName", label: "Signatory's name" },
  { key: "signatoryTitle", label: "Signatory's title" },
];
const KNOWN = new Set(TEMPLATE_PLACEHOLDERS.map((p) => p.key));

export const DEFAULT_OFFER_TEMPLATE = `Subject: Offer of employment: {{designation}}

Dear {{name}},

We are pleased to offer you the position of {{designation}} at {{company}}[[, in the {{department}} department]][[, based at {{location}}]]. We were impressed by your skills and experience, and we look forward to you joining our team.

Your employment will begin on {{joiningDate}}[[, and you will report to {{reportingTo}}]].

[[Your total annual compensation (cost to company) will be {{ctc}}. A detailed breakup and the other terms of your employment will be set out in your appointment letter.]]

[[You will be on probation for {{probation}} from your date of joining.]] [[After confirmation, either party may end the employment by giving {{notice}} written notice.]]

This offer is subject to satisfactory verification of your documents and references, and to your agreeing to the company's policies, including confidentiality.

Please sign and return a copy of this letter[[ by {{acceptBy}}]] to confirm that you accept this offer.

We are delighted to welcome you to {{company}}.

Yours sincerely,
[space]
{{signatoryName}}
[[{{signatoryTitle}}]]
{{company}}

---
Acceptance
I, {{name}}, accept the offer of employment on the terms above.
Signature: ______________________________
Date: ______________________`;

export const TEMPLATE_MAX = 6000;

/** Check a template an admin typed. Returns the cleaned text, or a message that says what to fix. */
export function checkTemplate(input: unknown): { ok: true; data: string } | { ok: false; error: string } {
  const text = (typeof input === "string" ? input : "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/₹[ \t]*/g, "INR ")
    .trim();
  if (text.length < 20) return { ok: false, error: "The template is too short." };
  if (text.length > TEMPLATE_MAX) return { ok: false, error: `Keep the template to ${TEMPLATE_MAX} characters or fewer.` };
  const unknown = [...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]).filter((k) => !KNOWN.has(k));
  if (unknown.length > 0) return { ok: false, error: `Unknown detail {{${unknown[0]}}}. Use the buttons to add details.` };
  if (/[{}]{2}/.test(text.replace(/\{\{[^{}]*\}\}/g, ""))) return { ok: false, error: "A {{ detail }} is missing its brackets." };
  for (const [n, line] of text.split("\n").entries()) {
    const opens = (line.match(/\[\[/g) ?? []).length;
    const closes = (line.match(/\]\]/g) ?? []).length;
    if (opens !== closes) return { ok: false, error: `Line ${n + 1}: every [[ needs a ]] on the same line.` };
    if (/\[\[(?:(?!\]\]).)*\[\[/.test(line)) return { ok: false, error: `Line ${n + 1}: [[ ]] pieces can't be inside each other.` };
  }
  return { ok: true, data: text };
}

/** What each {{detail}} turns into. */
export function placeholderValues(f: OfferFields): Record<string, string> {
  return {
    name: f.name,
    designation: f.designation,
    department: f.department,
    location: f.location,
    joiningDate: dateText(f.joiningDate),
    ctc: f.ctc,
    reportingTo: f.reportingTo,
    probation: f.probationMonths && Number(f.probationMonths) > 0 ? months(f.probationMonths) : "",
    notice: f.noticeDays && Number(f.noticeDays) > 0 ? days(f.noticeDays) : "",
    issueDate: dateText(f.issueDate),
    acceptBy: f.acceptBy ? dateText(f.acceptBy) : "",
    company: f.company,
    companyAddress: f.companyAddress,
    signatoryName: f.signatoryName || "Authorised Signatory",
    signatoryTitle: f.signatoryTitle,
  };
}

/** One template line: optional [[ pieces ]] are dropped when a detail inside is empty, then the details are filled in. */
function renderLine(line: string, values: Record<string, string>): string {
  const fill = (t: string) => t.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_, k: string) => values[k] ?? "");
  const withPieces = line.replace(/\[\[(.*?)\]\]/g, (_, inner: string) => {
    const keys = [...inner.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]);
    return keys.some((k) => !(values[k] ?? "").trim()) ? "" : fill(inner);
  });
  return fill(withPieces).replace(/\s{2,}/g, " ").trim();
}

export type OfferLetterText = {
  company: string;
  address: string;
  date: string;
  recipient: string;
  subject: string;
  /** Paragraphs; each is a list of lines. A line "[space]" is a gap. */
  blocks: string[][];
  /** The acceptance block(s) at the bottom; the first line is its heading. */
  acceptance: string[][];
  /** The signatory's name, so it can be shown in bold. */
  signatory: string;
};

/** The letter, as text, from a template and the details. */
export function offerLetter(f: OfferFields, template: string = DEFAULT_OFFER_TEMPLATE): OfferLetterText {
  const values = placeholderValues(f);
  const main: string[][] = [[]];
  const accept: string[][] = [[]];
  let target = main;
  let subject = "";

  for (const raw of template.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.trim() === "---") {
      target = accept;
      continue;
    }
    const rendered = renderLine(raw, values);
    const blank = raw.trim() === "";
    if (!blank && rendered === "") continue; // an optional line with nothing to say
    if (blank) {
      if (target[target.length - 1].length > 0) target.push([]); // one blank line ends a paragraph; extra blanks are ignored
      continue;
    }
    if (target === main && !subject && /^subject:/i.test(rendered)) {
      subject = rendered.replace(/^subject:\s*/i, "");
      continue;
    }
    target[target.length - 1].push(rendered);
  }
  return {
    company: f.company,
    address: f.companyAddress,
    date: dateText(f.issueDate),
    recipient: f.name,
    subject,
    blocks: main.filter((b) => b.length > 0),
    acceptance: accept.filter((b) => b.length > 0),
    signatory: values.signatoryName,
  };
}

/** For the live preview: empty details show a label in brackets, so the sentences still read. */
export function previewFields(f: OfferFields): OfferFields {
  const blank = (v: string, label: string) => v || `[${label}]`;
  return { ...f, name: blank(f.name, "Name"), designation: blank(f.designation, "Job title"), company: blank(f.company, "Company") };
}
