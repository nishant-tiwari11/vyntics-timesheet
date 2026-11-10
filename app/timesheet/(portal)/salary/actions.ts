"use server";

import { revalidatePath } from "next/cache";
import { raiseQuery } from "@/lib/payroll/queries";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type SalaryResult = { ok: true } | { ok: false; error: string };

// An employee raising a question about THEIR OWN payslip. The person is taken from the session in lib/payroll/queries.ts,
// and the database refuses a payslip that isn't theirs.
export async function raiseQueryAction(payslipId: string, topic: string, message: string): Promise<SalaryResult> {
  try {
    await raiseQuery(payslipId, topic, message);
    revalidatePath("/timesheet/salary");
    revalidatePath("/timesheet/payroll/queries");
    return { ok: true };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("salary", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
