"use server";

import { logError } from "@/lib/timesheet/log";
import { revalidatePath } from "next/cache";
import { TimesheetError } from "@/lib/timesheet/errors";
import { getWeekDetail, setRole } from "@/lib/timesheet/admin";
import { decideRequest } from "@/lib/timesheet/requests";
import { decideWeek } from "@/lib/timesheet/weeks";
import type { WeekRow } from "@/lib/timesheet/types";

// Every action below goes through helpers that call requireAdmin() on the server.
// Hiding buttons in the UI is only for convenience.

export type AdminResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("admin action", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/timesheet/admin");

export async function decideWeekAction(weekId: string, decision: "approved" | "draft"): Promise<AdminResult> {
  try {
    await decideWeek(weekId, decision);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function getWeekDetailAction(
  weekId: string
): Promise<{ ok: true; rows: WeekRow[] } | { ok: false; error: string }> {
  try {
    return { ok: true, rows: await getWeekDetail(weekId) };
  } catch (e) {
    return fail(e);
  }
}

export async function decideRequestAction(id: string, decision: "approved" | "rejected"): Promise<AdminResult> {
  try {
    await decideRequest(id, decision);
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
