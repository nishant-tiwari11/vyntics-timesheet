// The wording of the offer letter, one editable piece per clause. Which clauses and table rows a letter has for each engagement
// type is decided in code (build.ts), so a typo here can never remove a clause or break the layout. A piece may use {{details}}
// such as {{company}} or {{noticeDays}}; a blank line starts a new paragraph. Plain code with no server-only imports.

export type ClauseKey =
  | "intro_internship"
  | "intro_phased"
  | "intro_full_time"
  | "engagement_period"
  | "employment_period"
  | "phases_intro"
  | "phases_evaluation"
  | "phases_ppo"
  | "responsibilities"
  | "stipend_unpaid"
  | "stipend_paid"
  | "stipend_phased"
  | "salary"
  | "probation"
  | "working_hours"
  | "leave"
  | "attendance"
  | "confidentiality"
  | "intellectual_property"
  | "ethics"
  | "non_circumvention"
  | "outside_work"
  | "ending"
  | "return_property"
  | "acceptance_intro"
  | "ppo_row"
  | "outcome";

export type ClauseField = { key: ClauseKey; label: string; used: string };

/** What each piece is called on the settings screen, and where it appears. */
export const CLAUSE_FIELDS: ClauseField[] = [
  { key: "intro_internship", label: "Opening: internship", used: "Paid and unpaid internships" },
  { key: "intro_phased", label: "Opening: phased internship", used: "Phased internships" },
  { key: "intro_full_time", label: "Opening: full-time", used: "Full-time employment" },
  { key: "engagement_period", label: "Clause: Engagement Period", used: "Paid and unpaid internships" },
  { key: "employment_period", label: "Clause: Employment Period", used: "Full-time employment" },
  { key: "phases_intro", label: "Clause: Phases", used: "Phased internships" },
  { key: "phases_evaluation", label: "Clause: Evaluation", used: "Phased internships" },
  { key: "phases_ppo", label: "Clause: PPO paragraph", used: "Phased internships, when PPO consideration is on" },
  { key: "responsibilities", label: "Clause: Responsibilities", used: "All letters" },
  { key: "stipend_unpaid", label: "Clause: Unpaid internship", used: "Unpaid internships" },
  { key: "stipend_paid", label: "Clause: Stipend and deductions", used: "Paid internships" },
  { key: "stipend_phased", label: "Clause: Stipend and deductions (phased)", used: "Phased internships" },
  { key: "salary", label: "Clause: Salary and deductions", used: "Full-time employment" },
  { key: "probation", label: "Clause: Probation", used: "Full-time employment" },
  { key: "working_hours", label: "Clause: Working hours", used: "Full-time employment" },
  { key: "leave", label: "Clause: Leave", used: "Full-time employment" },
  { key: "attendance", label: "Clause: Attendance, leave and availability", used: "Internships" },
  { key: "confidentiality", label: "Clause: Confidentiality", used: "All letters" },
  { key: "intellectual_property", label: "Clause: Intellectual property", used: "All letters" },
  { key: "ethics", label: "Clause: Code of ethics", used: "All letters" },
  { key: "non_circumvention", label: "Clause: Client non-circumvention", used: "All letters, when the months are above 0" },
  { key: "outside_work", label: "Clause: Outside work", used: "All letters, when that clause is switched on" },
  { key: "ending", label: "Clause: Ending", used: "All letters" },
  { key: "return_property", label: "Clause: Return of property", used: "All letters" },
  { key: "acceptance_intro", label: "Acceptance: opening line", used: "All letters" },
  { key: "ppo_row", label: "Table row: Indicative Full-Time Compensation", used: "Internships, when PPO consideration is on" },
  { key: "outcome", label: "Annexure row: Possible Outcome", used: "Phased internships" },
];

export const DEFAULT_CLAUSES: Record<ClauseKey, string> = {
  intro_internship:
    "We are pleased to offer you an internship with {{company}}, with effect from your joining date of {{joiningDate}}. This letter records the main commercial terms, the evaluation process, and the basic professional obligations that apply while you work with {{company}} and its clients.",
  intro_phased:
    "We are pleased to offer you an internship with {{company}}, with effect from your joining date of {{joiningDate}}. This letter records the main commercial terms, the internship phases, the evaluation process, and the basic professional obligations that apply while you work with {{company}} and its clients.",
  intro_full_time:
    "We are pleased to offer you full-time employment with {{company}} as {{designation}}, with effect from your joining date of {{joiningDate}}. This letter records the main terms of your employment, your compensation, and the basic professional obligations that apply while you work with {{company}} and its clients.",
  engagement_period:
    "Your internship with {{company}} runs from {{periodStart}} to {{periodEnd}}. During it, {{company}} will assign work, mentoring, learning tasks, client-related responsibilities, and internal project responsibilities based on business needs and your skill level.",
  employment_period:
    "Your employment with {{company}} begins on {{joiningDate}} as {{designation}} and continues until it is ended under the clause on ending your employment, subject to the probation terms in this letter.",
  phases_intro:
    "Your internship is structured in {{phaseCount}} phases: {{phaseList}}. During the internship, {{company}} will assign work, mentoring, learning tasks, client-related responsibilities, and internal project responsibilities based on business needs and your skill level.",
  phases_evaluation:
    "At or before the end of each phase, {{company}} will evaluate your performance, conduct, learning progress, attendance, ownership, communication, client readiness, and project contribution. If the evaluation is satisfactory and business requirements permit, you will move to the next phase. {{company}} may instead extend a phase or complete the internship without moving you to the next phase.",
  phases_ppo:
    "Towards the end of the final phase, {{company}} will conduct a further evaluation. Based on your performance and business requirements, {{company}} may offer you a Pre-Placement Offer (PPO) for a full-time role, extend the internship on revised or same terms, or complete the internship without conversion to full-time employment. Any PPO or full-time offer, if made, will be issued separately in writing and will mention the designation, compensation, joining date for the full-time role, and other employment terms. Completion of any phase does not automatically create a right to the next phase, a PPO, or full-time employment.",
  responsibilities:
    "You will perform tasks assigned by {{company}}, including development, analytics, AI, data engineering, research, documentation, testing, support, and client-related work. You must maintain professional standards, meet reasonable timelines, communicate blockers promptly, and follow the directions of your reporting manager.",
  stipend_unpaid: "This is an unpaid internship. No stipend or other payment is payable for it.",
  stipend_paid:
    "Your stipend of {{stipend}} will be paid monthly after the end of the relevant month, subject to attendance, applicable statutory deductions, tax deduction at source where applicable, and {{company}} payroll processes.",
  stipend_phased:
    "{{phaseMoney}} A stipend is paid monthly after the end of the relevant month, subject to attendance, applicable statutory deductions, tax deduction at source where applicable, and {{company}} payroll processes.",
  salary:
    "Your annual cost to company (CTC) is {{ctc}}, broken up as shown in Annexure A. Salary is paid monthly after the end of the relevant month, subject to attendance, applicable statutory deductions, tax deduction at source, and {{company}} payroll processes.",
  probation:
    "You will be on probation for {{probationMonths}} from your joining date. During probation your performance, conduct, and attendance will be reviewed, and {{company}} will confirm your employment in writing if the review is satisfactory. {{company}} may extend probation if it needs more time to decide.",
  working_hours:
    "Your working hours, weekly offs, and attendance requirements are those communicated by {{company}} for your work location ({{workLocation}}). You must follow them and keep your timesheet up to date.",
  leave:
    "Leave is governed by the {{company}} leave policy. Leave must be approved in advance except in genuine emergencies.",
  attendance:
    "You must follow the working hours, attendance requirements, leave approval process, meeting commitments, and availability expectations communicated by {{company}}. Leave during the internship must be approved in advance except in genuine emergencies.",
  confidentiality:
    "During and after your engagement, you must keep confidential all {{company}} and client information, including source code, prompts, credentials, architecture, datasets, business plans, pricing, proposals, contacts, documents, designs, reports, financial details, and project information. You must not share such information with any person or platform unless {{company}} has approved it in writing.\n\nYou must not upload confidential information, client data, proprietary code, credentials, or internal documents to public tools, personal accounts, or unapproved AI systems. You must use only the tools, repositories, accounts, and communication channels approved by {{company}} for project work.",
  intellectual_property:
    "All work created, developed, improved, written, configured, trained, documented, or delivered by you during your engagement in connection with {{company}} work will belong to {{company}} or its client, as applicable. This includes code, scripts, models, workflows, prompts, documentation, dashboards, designs, data pipelines, reports, research, and other project materials.\n\nYou must hand over all work product, credentials, documents, code, files, and project materials whenever requested. Any pre-existing personal work owned by you before joining remains yours, provided it is clearly separate from {{company}} work and is not created using {{company}} or client confidential information.",
  ethics:
    "You are expected to act honestly, protect client trust, avoid conflicts of interest, maintain respectful communication, follow information security practices, and comply with {{company}} policies and lawful instructions. You must not misrepresent your work, misuse access, copy third-party material unlawfully, bypass security controls, or use {{company}} systems for personal commercial work.",
  non_circumvention:
    "During your engagement and for {{nonCircumventionMonths}} months after it ends, you must not directly or indirectly approach, solicit, accept work from, contract with, or provide competing services to any {{company}} client, prospective client, or client contact with whom you worked, interacted, or about whom you received confidential information through {{company}}, unless {{company}} gives prior written approval.\n\nThis clause is intended to protect {{company}} client relationships and confidential information. It does not stop you from taking general employment where you do not misuse {{company}} confidential information or bypass {{company}} client relationships.",
  outside_work:
    "During your engagement, you must not take outside work, freelance assignments, internships, consulting work, or employment that conflicts with {{company}} work, uses {{company}} or client information, affects your availability, or creates a conflict of interest, unless {{company}} approves it in writing.",
  ending:
    "Either party may end this {{engagementWord}} by giving {{noticeDays}} days written notice{{inLieu}}, unless a shorter period is mutually agreed in writing. {{company}} may end the engagement earlier for misconduct, breach of confidentiality, misuse of access, poor performance, abandonment, business requirements, or any other reasonable cause after considering the circumstances.",
  return_property:
    "On request or at the end of the engagement, you must return all {{company}} and client property, documents, files, credentials, devices, records, and access materials, and delete {{company}} or client information from personal devices and accounts where permitted by law and {{company}} instructions.",
  acceptance_intro: "Please sign and return a copy of this letter to confirm your acceptance of the {{engagementWord}} on the terms stated above.",
  ppo_row: "Compensation under a PPO or full-time offer, if made, will be decided based on performance, role fit, and business requirements.",
  outcome: "Move to the next phase, extension, or completion of engagement{{ppoOutcome}}",
};

export const CLAUSE_MAX = 3000;

/** The saved wording with every missing or empty piece filled from the defaults. Unknown keys are ignored. */
export function mergeClauses(saved: unknown): Record<ClauseKey, string> {
  const out = { ...DEFAULT_CLAUSES };
  if (saved && typeof saved === "object") {
    for (const key of Object.keys(DEFAULT_CLAUSES) as ClauseKey[]) {
      const v = (saved as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, CLAUSE_MAX);
    }
  }
  return out;
}

/** Fill {{details}}. Anything that isn't a known detail becomes empty, and what is inserted is never scanned again. */
export function fillClause(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
