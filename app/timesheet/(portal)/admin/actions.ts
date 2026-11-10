"use server";

import { logError } from "@/lib/timesheet/log";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncApprovedRequest } from "@/lib/google/sync";
import { TimesheetError } from "@/lib/timesheet/errors";
import { setRole } from "@/lib/timesheet/admin";
import { addAllowedEmails, removeAllowedEmail } from "@/lib/timesheet/access";
import { decideRequest } from "@/lib/timesheet/requests";

// Every action below goes through helpers that call requireAdmin() on the server.
// Hiding buttons in the UI is only for convenience.

export type AdminResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("admin action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/timesheet/admin");

export async function decideRequestAction(id: string, decision: "approved" | "rejected"): Promise<AdminResult> {
  try {
    await decideRequest(id, decision);
    // Put approved leave/WFH into the employee's Google Calendar after the response is sent. If they haven't
    // connected, or Google is down, this does nothing and the approval is unaffected.
    if (decision === "approved") after(() => syncApprovedRequest(id));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRoleAction(userId: string, role: "employee" | "admin"): Promise<AdminResult> {
  try {
    await setRole(userId, role);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addAllowedEmailsAction(
  input: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const added = await addAllowedEmails(input);
    refresh();
    return { ok: true, added };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAllowedEmailAction(email: string): Promise<AdminResult> {
  try {
    await removeAllowedEmail(email);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
