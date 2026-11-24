import { isYmd } from "@/lib/timesheet/dates";
import { cleanAmount } from "./check";
import { emptyLetter, type EngagementType, type LetterData, type Phase } from "./types";

// Starting values for a new letter. Plain code with no server-only imports.

export const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
};
export const dayBefore = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
export const dayAfter = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
export const monthName = (ymd: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

/** The phases a letter starts with for each type, worked out from the joining date. */
export function defaultPhases(type: EngagementType, joining: string): Phase[] {
  if (type === "full_time") return [];
  if (type === "phased_internship") {
    const p2 = addMonths(joining, 3);
    const end2 = dayBefore(addMonths(p2, 6));
    return [
      { name: "Phase 1", startDate: joining, endDate: dayBefore(p2), isPaid: false, monthlyAmount: "", evaluationWindow: monthName(dayBefore(p2)) },
      { name: "Phase 2", startDate: p2, endDate: end2, isPaid: true, monthlyAmount: "", evaluationWindow: monthName(end2) },
    ];
  }
  return [{ name: "Internship", startDate: joining, endDate: dayBefore(addMonths(joining, type === "paid_internship" ? 6 : 3)), isPaid: type === "paid_internship", monthlyAmount: "", evaluationWindow: "" }];
}

/** A new letter for a person: their name and email filled in, a phased internship starting two weeks from today. */
export function newLetter(today: string, person: { name: string; email: string; manager: string }): LetterData {
  const joining = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  return { ...emptyLetter(today), joiningDate: joining, candidateName: person.name, candidateEmail: person.email, reportingManager: person.manager, phases: defaultPhases("phased_internship", joining) };
}

/**
 * The form as it is right now, made complete enough to draw: a missing name, role, date or amount becomes a bracketed placeholder
 * (an amount of 0 is drawn as "INR [amount]"). Only the on-screen preview uses this; saving and the PDF use the strict check.
 */
export function previewLetterData(d: LetterData, today: string): LetterData {
  const date = (v: string) => (isYmd(v) ? v : today);
  const joiningDate = date(d.joiningDate);
  const phases = (d.phases.length > 0 ? d.phases : defaultPhases(d.engagementType, joiningDate)).map((p) => ({
    ...p,
    startDate: date(p.startDate),
    endDate: isYmd(p.endDate) && p.endDate >= date(p.startDate) ? p.endDate : date(p.startDate),
    monthlyAmount: p.isPaid ? cleanAmount(p.monthlyAmount) || "0" : "",
  }));
  return {
    ...d,
    candidateName: d.candidateName.trim() || "[Name]",
    designation: d.designation.trim() || "[Role]",
    letterDate: date(d.letterDate),
    joiningDate,
    phases: d.engagementType === "full_time" ? [] : d.engagementType === "phased_internship" ? phases : phases.slice(0, 1),
    ctc: d.engagementType === "full_time" ? cleanAmount(d.ctc) || "0" : "",
    salaryBreakup: d.salaryBreakup.filter((l) => l.label.trim() && cleanAmount(l.monthly)).map((l) => ({ label: l.label.trim(), monthly: cleanAmount(l.monthly) })),
    customClauses: (d.customClauses ?? []).filter((c) => c.title.trim() || c.text.trim()).map((c) => ({ title: c.title.trim() || "[Clause title]", text: c.text.trim() || "[Wording]" })),
    probationMonths: /^\d{1,2}$/.test(d.probationMonths) ? d.probationMonths : "0",
    noticeDays: /^\d{1,3}$/.test(d.noticeDays) ? d.noticeDays : "0",
    nonCircumventionMonths: /^\d{1,2}$/.test(d.nonCircumventionMonths) ? d.nonCircumventionMonths : "0",
  };
}
