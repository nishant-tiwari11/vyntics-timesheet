"use server";

import { logError } from "@/lib/timesheet/log";
import { revalidatePath } from "next/cache";
import { TimesheetError } from "@/lib/timesheet/errors";
import { todayInOffice } from "@/lib/timesheet/dates";
import { cancelRequest, createRequest } from "@/lib/timesheet/requests";
import { addLog, deleteLog } from "@/lib/timesheet/logs";

export type ActionResult = { ok: true } | { ok: false; error: string };

const REASON_MAX = 120;

function fail(e: unknown): ActionResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("dashboard action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createRequestAction(input: {
  type: "leave" | "wfh";
  from: string;
  to: string;
  note: string;
}): Promise<ActionResult> {
  try {
    // The browser also limits these, but the server re-checks everything.
    if (typeof input?.from === "string" && input.from < todayInOffice()) {
      throw new TimesheetError("The start date can't be in the past.");
    }
    if (typeof input?.note === "string" && input.note.trim().length > REASON_MAX) {
      throw new TimesheetError(`Keep the reason to ${REASON_MAX} characters or fewer.`);
    }
    await createRequest({ type: input.type, from: input.from, to: input.to, note: input.note });
    revalidatePath("/timesheet/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelRequestAction(id: string): Promise<ActionResult> {
  try {
    await cancelRequest(id);
    revalidatePath("/timesheet/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const LOG_MAX = 500;

export async function addLogAction(input: { text: string; hours: number | null }): Promise<ActionResult> {
  try {
    if (typeof input?.text === "string" && input.text.trim().length > LOG_MAX) {
      throw new TimesheetError(`Keep your entry to ${LOG_MAX} characters or fewer.`);
    }
    // "Today" is always the Asia/Kolkata date, computed here on the server.
    await addLog(input.text, input.hours, todayInOffice());
    revalidatePath("/timesheet/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLogAction(id: string): Promise<ActionResult> {
  try {
    await deleteLog(id, todayInOffice());
    revalidatePath("/timesheet/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
