"use server";

import { isUuid } from "@/lib/avatar";
import { loadEmployeeToday, type EmployeeToday } from "@/lib/admin/employeeToday";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// The overview's orbit dialer asks for one employee's day when a badge is opened. Admin only: checked here, and again inside
// loadEmployeeToday and by the database.
export async function loadEmployeeTodayAction(userId: string): Promise<{ ok: true; data: EmployeeToday } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return { ok: false, error: "Only admins can do that." };
  if (!isUuid(userId)) return { ok: false, error: "That person could not be found." };
  try {
    return { ok: true, data: await loadEmployeeToday(userId) };
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("employee dialer", e);
    return { ok: false, error: e instanceof TimesheetError ? e.message : "Something went wrong. Please try again." };
  }
}
