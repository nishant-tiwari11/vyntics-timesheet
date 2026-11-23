// Onboarding: what a new employee must give, and the rules for it. Plain code with no server-only imports, so the server, the
// browser and the tests share it. supabase/step35_onboarding.sql enforces the same shapes.

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^[0-9]{6,20}$/;

export type DegreeMode = "degree" | "marksheets";
export type AccountType = "savings" | "salary" | "current";
export type ExperienceType = "free_internship" | "paid";

export const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: "savings", label: "Savings account" },
  { id: "salary", label: "Salary account" },
  { id: "current", label: "Current account" },
];

export type Answers = {
  degreeMode: DegreeMode | null;
  bank: { holder: string; bankName: string; account: string; ifsc: string; branch: string; type: AccountType | ""; confirmed: boolean };
  hasExperience: boolean | null;
  experienceType: ExperienceType | null;
};

export const emptyAnswers = (): Answers => ({
  degreeMode: null,
  bank: { holder: "", bankName: "", account: "", ifsc: "", branch: "", type: "", confirmed: false },
  hasExperience: null,
  experienceType: null,
});

export type Need = { category: string; label: string; hint: string };

/** The files this person has to upload, given their answers. */
export function neededDocs(a: Pick<Answers, "degreeMode" | "hasExperience" | "experienceType">): Need[] {
  const out: Need[] = [];
  if (a.degreeMode === "degree") out.push({ category: "degree", label: "Degree certificate", hint: "One PDF" });
  if (a.degreeMode === "marksheets") out.push({ category: "marksheets", label: "All semester marksheets", hint: "PDF. Upload one file per semester, or all in one." });
  out.push({ category: "aadhaar", label: "Aadhaar card", hint: "One PDF with both sides" });
  if (a.hasExperience === true) {
    out.push({ category: "prev_offer_letter", label: "Offer letter of your previous company", hint: "One PDF" });
    if (a.experienceType === "paid") out.push({ category: "prev_payslip", label: "Your latest payslip", hint: "One PDF" });
  }
  out.push({ category: "passport_photo", label: "Passport-size photo", hint: "A clear JPG or PNG, plain background" });
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The first problem with the bank details, in words the person can act on; null when they are fine. */
export function checkBank(b: Answers["bank"], accountAgain?: string): string | null {
  if (clean(b.holder).length < 2) return "Enter the account holder's name as it is on the bank account.";
  if (clean(b.bankName).length < 2) return "Enter the bank's name.";
  if (!ACCOUNT_RE.test(b.account.trim())) return "The account number should be 6 to 20 digits, with no spaces.";
  if (accountAgain !== undefined && accountAgain.trim() !== b.account.trim()) return "The two account numbers don't match.";
  if (!IFSC_RE.test(b.ifsc.trim().toUpperCase())) return "The IFSC code looks wrong. It is 11 characters, like HDFC0001234.";
  if (clean(b.branch).length < 2) return "Enter the branch name.";
  if (!b.type) return "Tick the type of account.";
  if (!b.confirmed) return "Tick the box to confirm the bank details are correct.";
  return null;
}

/** Everything still to do before this can be submitted, as short sentences. Empty means ready. */
export function missingForSubmit(a: Answers, uploaded: ReadonlySet<string>, accountAgain?: string): string[] {
  const out: string[] = [];
  if (!a.degreeMode) out.push("Say whether you have your degree certificate.");
  if (a.hasExperience === null) out.push("Say whether you have past work experience.");
  if (a.hasExperience === true && !a.experienceType) out.push("Say whether the previous role was a free internship or paid.");
  for (const need of neededDocs(a)) if (!uploaded.has(need.category)) out.push(`Upload: ${need.label}.`);
  const bank = checkBank(a.bank, accountAgain);
  if (bank) out.push(bank);
  return out;
}

/** "XXXXXX1234": enough to recognise the account without showing it. */
export const maskAccount = (n: string) => (n.length <= 4 ? n : `${"X".repeat(n.length - 4)}${n.slice(-4)}`);
