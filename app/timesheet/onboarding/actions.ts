"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveMyOnboarding } from "@/lib/onboarding/server";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Employee onboarding. Every call runs as the signed-in person; the database function only ever writes their own row.
export type OnboardingResult = { ok: true } | { ok: false; error: string };

const text = (max: number) => z.string().max(max).default("");
const schema = z.object({
  answers: z.object({
    degreeMode: z.enum(["degree", "marksheets"]).nullable(),
    bank: z.object({
      holder: text(100),
      bankName: text(100),
      account: text(30),
      ifsc: text(20),
      branch: text(100),
      type: z.enum(["savings", "salary", "current", ""]),
      confirmed: z.boolean(),
    }),
    hasExperience: z.boolean().nullable(),
    experienceType: z.enum(["free_internship", "paid"]).nullable(),
  }),
  accountAgain: text(30),
  submit: z.boolean(),
});

export async function saveOnboardingAction(input: unknown): Promise<OnboardingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form and try again." };
  try {
    await saveMyOnboarding(parsed.data);
    revalidatePath("/timesheet/onboarding");
    revalidatePath("/timesheet/admin/documents");
    return { ok: true };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("onboarding-save", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
