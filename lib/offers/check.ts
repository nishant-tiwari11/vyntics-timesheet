import { isYmd } from "@/lib/timesheet/dates";
import { WORK_LOCATIONS, isEngagementType, type LetterData, type Phase, type SalaryLine, type WorkLocation } from "./types";

// Checks everything an admin typed for an offer letter, and cleans it. The browser checks too, but only this check counts.
// The rules depend on the engagement type: an unpaid internship has one unpaid period, a paid internship one paid period, a
// phased internship two or more phases in order, and full-time employment has a CTC and (optionally) a salary breakup.

type Result = { ok: true; data: LetterData } | { ok: false; error: string };

const clean = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "")
    .replace(/₹/g, "INR ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);

/** Whole rupees from what was typed ("12,000", "INR 12000"). "" if it isn't digits. */
export function cleanAmount(v: unknown): string {
  const t = (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/INR|[₹,\s]/gi, "");
  return /^\d{1,10}$/.test(t) ? String(Number(t)) : "";
}

const whole = (v: unknown, max: number) => {
  const t = clean(v, 4);
  return /^\d{1,3}$/.test(t) && Number(t) <= max ? String(Number(t)) : null;
};

export function checkLetter(input: unknown): Result {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const fail = (error: string): Result => ({ ok: false, error });

  if (!isEngagementType(i.engagementType)) return fail("Choose the type of letter.");
  const engagementType = i.engagementType;

  const candidateName = clean(i.candidateName, 100);
  if (!candidateName) return fail("Enter the employee's name.");
  const designation = clean(i.designation, 100);
  if (!designation) return fail("Enter the role or job title.");
  const letterDate = clean(i.letterDate, 10);
  if (!isYmd(letterDate)) return fail("Enter a valid letter date.");
  const joiningDate = clean(i.joiningDate, 10);
  if (!isYmd(joiningDate)) return fail("Enter a valid joining date.");
  const workLocation = WORK_LOCATIONS.find((w) => w === i.workLocation) as WorkLocation | undefined;
  if (!workLocation) return fail("Choose the work location: Office, WFH or Hybrid.");

  const candidateEmail = clean(i.candidateEmail, 120);
  if (candidateEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidateEmail)) return fail("Enter a valid email address for the employee.");
  const candidatePhone = clean(i.candidatePhone, 20);
  if (candidatePhone && !/^[0-9+()\-\s]{6,20}$/.test(candidatePhone)) return fail("The phone number can only have digits, spaces, + ( ) and -.");

  const noticeDays = whole(i.noticeDays, 180);
  if (noticeDays === null) return fail("Enter the notice period as a number of days, up to 180.");
  const nonCircumventionMonths = whole(i.nonCircumventionMonths ?? "24", 60);
  if (nonCircumventionMonths === null) return fail("Enter the non-circumvention period in months, up to 60 (0 leaves the clause out).");

  // ---- internship phases ----
  const phases: Phase[] = [];
  if (engagementType !== "full_time") {
    const raw = Array.isArray(i.phases) ? (i.phases as unknown[]).slice(0, 8) : [];
    const want = engagementType === "phased_internship" ? "phases" : "period";
    if (raw.length === 0) return fail(engagementType === "phased_internship" ? "Add the phases of the internship." : "Enter the dates of the internship.");
    if (engagementType !== "phased_internship" && raw.length !== 1) return fail("This type has one period. Use a phased internship for several.");
    if (engagementType === "phased_internship" && raw.length < 2) return fail("A phased internship needs at least two phases.");
    for (const [n, p] of raw.entries()) {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const label = engagementType === "phased_internship" ? `Phase ${n + 1}` : "The internship";
      const name = clean(o.name, 40) || (engagementType === "phased_internship" ? `Phase ${n + 1}` : "Internship");
      const startDate = clean(o.startDate, 10);
      const endDate = clean(o.endDate, 10);
      if (!isYmd(startDate) || !isYmd(endDate)) return fail(`${label}: enter a valid start and end date.`);
      if (endDate < startDate) return fail(`${label}: the end date can't be before the start date.`);
      const prev = phases[n - 1];
      if (prev && startDate <= prev.endDate) return fail(`${label} must start after the previous ${want === "phases" ? "phase" : "period"} ends.`);
      const isPaid = engagementType === "unpaid_internship" ? false : engagementType === "paid_internship" ? true : o.isPaid === true;
      const monthlyAmount = isPaid ? cleanAmount(o.monthlyAmount) : "";
      if (isPaid && (!monthlyAmount || Number(monthlyAmount) <= 0)) return fail(`${label}: enter the monthly stipend as a number.`);
      phases.push({ name, startDate, endDate, isPaid, monthlyAmount, evaluationWindow: clean(o.evaluationWindow, 40) });
    }
  }

  // ---- full-time pay ----
  let ctc = "";
  const salaryBreakup: SalaryLine[] = [];
  let probationMonths = "0";
  if (engagementType === "full_time") {
    ctc = cleanAmount(i.ctc);
    if (!ctc || Number(ctc) <= 0) return fail("Enter the annual CTC as a number, for example 600000.");
    const probation = whole(i.probationMonths ?? "0", 12);
    if (probation === null) return fail("Probation can be 0 to 12 months.");
    probationMonths = probation;
    const lines = Array.isArray(i.salaryBreakup) ? (i.salaryBreakup as unknown[]).slice(0, 20) : [];
    for (const l of lines) {
      const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      const label = clean(o.label, 60);
      const monthly = cleanAmount(o.monthly);
      if (!label && !monthly) continue; // an empty row is ignored
      if (!label || !monthly) return fail("Each salary line needs a name and a monthly amount.");
      salaryBreakup.push({ label, monthly });
    }
    if (salaryBreakup.length > 0) {
      const yearly = salaryBreakup.reduce((n, l) => n + Number(l.monthly), 0) * 12;
      if (yearly !== Number(ctc)) return fail(`The salary lines add up to INR ${yearly.toLocaleString("en-IN")} a year, but the CTC is INR ${Number(ctc).toLocaleString("en-IN")}. Make them match.`);
    }
  }

  return {
    ok: true,
    data: {
      engagementType,
      letterDate,
      joiningDate,
      designation,
      workLocation,
      candidateName,
      candidateAddress: clean(i.candidateAddress, 250),
      candidateEmail,
      candidatePhone,
      reportingManager: clean(i.reportingManager, 100),
      phases,
      ctc,
      salaryBreakup,
      probationMonths,
      noticeDays,
      ppoConsideration: engagementType !== "full_time" && i.ppoConsideration === true,
      nonCircumventionMonths,
      includeOutsideWorkClause: i.includeOutsideWorkClause !== false,
    },
  };
}
