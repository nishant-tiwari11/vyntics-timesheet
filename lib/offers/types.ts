// Offer letters: the shapes shared by the form, the live preview, the PDF and the database. Plain code with no server-only imports.

export const ENGAGEMENT_TYPES = [
  { id: "unpaid_internship", label: "Unpaid internship", hint: "One unpaid period" },
  { id: "paid_internship", label: "Paid internship", hint: "One paid period with a monthly stipend" },
  { id: "phased_internship", label: "Phased internship", hint: "Phases, such as unpaid first and then paid, each evaluated" },
  { id: "full_time", label: "Full-time employment", hint: "Salary (CTC), probation and notice" },
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number]["id"];
export const isEngagementType = (v: unknown): v is EngagementType => ENGAGEMENT_TYPES.some((t) => t.id === v);
export const isInternship = (t: EngagementType) => t !== "full_time";

export const WORK_LOCATIONS = ["Office", "WFH", "Hybrid"] as const;
export type WorkLocation = (typeof WORK_LOCATIONS)[number];

/** One phase of an internship. Amounts are whole rupees written as digits ("12000"). */
export type Phase = {
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  isPaid: boolean;
  /** Per month; only used when the phase is paid. */
  monthlyAmount: string;
  /** Free text, for example "January 2027". */
  evaluationWindow: string;
};

/** One line of a full-time salary breakup (monthly amount in whole rupees; the yearly amount is worked out). */
export type SalaryLine = { label: string; monthly: string };

import type { ClauseKey } from "./clauses";

export type LetterData = {
  engagementType: EngagementType;
  /** YYYY-MM-DD */
  letterDate: string;
  joiningDate: string;
  designation: string;
  workLocation: WorkLocation;
  // The person
  candidateName: string;
  candidateAddress: string;
  candidateEmail: string;
  candidatePhone: string;
  reportingManager: string;
  // Internships
  phases: Phase[];
  // Full-time
  /** Annual cost to company, whole rupees. */
  ctc: string;
  salaryBreakup: SalaryLine[];
  probationMonths: string;
  // All types
  noticeDays: string;
  ppoConsideration: boolean;
  /** 0 leaves the clause out. */
  nonCircumventionMonths: string;
  includeOutsideWorkClause: boolean;
  /** Wording changed for THIS letter only (edited in the preview). Anything not listed uses the company wording from the settings. */
  clauseOverrides: Partial<Record<ClauseKey, string>>;
};

/** Company details, set once by an admin. */
export type CompanyInfo = {
  name: string;
  gstin: string;
  registeredAddress: string;
  /** Shown in the footer, for example "Jaipur Rajasthan". */
  city: string;
  signatoryName: string;
  signatoryTitle: string;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "Vyntics",
  gstin: "",
  registeredAddress: "",
  city: "",
  signatoryName: "",
  signatoryTitle: "",
};

export function emptyLetter(today: string): LetterData {
  return {
    engagementType: "phased_internship",
    letterDate: today,
    joiningDate: today,
    designation: "Intern",
    workLocation: "Office",
    candidateName: "",
    candidateAddress: "",
    candidateEmail: "",
    candidatePhone: "",
    reportingManager: "",
    phases: [],
    ctc: "",
    salaryBreakup: [],
    probationMonths: "3",
    noticeDays: "7",
    ppoConsideration: true,
    nonCircumventionMonths: "24",
    includeOutsideWorkClause: true,
    clauseOverrides: {},
  };
}

/** The structured letter that the preview and the PDF both draw. */
export type LetterBlock =
  | { t: "heading"; text: string }
  | { t: "para"; text: string; key?: ClauseKey }
  | { t: "clause"; n: number; title: string; paras: string[]; /** The wording each paragraph comes from, so the preview can edit it. */ keys?: ClauseKey[] }
  | { t: "table"; header?: string[]; rows: string[][]; widths: number[]; align?: ("left" | "right")[]; boldLastRow?: boolean; /** For each row, the phase (0-based) it shows, so the preview can edit it. */ rowPhase?: (number | null)[] }
  | { t: "acceptance"; company: string; signatoryName: string; signatoryTitle: string; letterDate: string; candidateName: string; typed?: { name: string; date: string } }
  | { t: "annexureTitle"; text: string }
  | { t: "note"; text: string };

export type LetterDoc = {
  title: string;
  subtitle: string;
  company: string;
  gstin: string;
  city: string;
  date: string;
  /** Name, address, email and phone of the person. */
  party: string[];
  subject: string;
  salutation: string;
  blocks: LetterBlock[];
};
