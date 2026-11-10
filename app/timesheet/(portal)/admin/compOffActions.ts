"use server";

import { revalidatePath } from "next/cache";
import { decide, updateSettings } from "@/lib/timesheet/compOff";
import type { CompOffSettings } from "@/lib/timesheet/compOffCore";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Admins only: each function below checks for an admin on the server, and the database checks again.

export type CompOffAdminResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): CompOffAdminResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("comp-off admin", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => {
  for (const path of ["/timesheet/admin", "/timesheet/leave", "/timesheet/dashboard"]) revalidatePath(path);
};

export async function decideCompOffAction(id: string, decision: "approved" | "rejected", note: string): Promise<CompOffAdminResult> {
  try {
    await decide(id, decision, note);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCompOffSettingsAction(input: CompOffSettings): Promise<CompOffAdminResult> {
  try {
    await updateSettings(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
