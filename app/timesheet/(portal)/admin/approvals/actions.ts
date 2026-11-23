"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncApprovedRequest } from "@/lib/google/sync";
import { decideRequestWithKind } from "@/lib/timesheet/approvals";
import { TimesheetError } from "@/lib/timesheet/errors";
import { isLeaveKind } from "@/lib/timesheet/leaveCore";
import { logError } from "@/lib/timesheet/log";

// Admin only: decideRequestWithKind checks for an admin on the server and the database checks again.
export type ApprovalResult = { ok: true } | { ok: false; error: string };

export async function decideLeaveAction(input: { id: string; decision: "approved" | "rejected"; kind?: string | null; note?: string }): Promise<ApprovalResult> {
  try {
    await decideRequestWithKind({
      id: input.id,
      decision: input.decision,
      kind: isLeaveKind(input.kind) ? input.kind : null,
      note: typeof input.note === "string" ? input.note : "",
    });
    // Approved leave and work from home go into the employee's Google Calendar after the response is sent. If they haven't
    // connected, or Google is down, nothing happens and the approval is unaffected.
    if (input.decision === "approved") after(() => syncApprovedRequest(input.id));
    for (const path of ["/timesheet/admin/approvals", "/timesheet/admin", "/timesheet/leave", "/timesheet/dashboard", "/timesheet/calendar"]) revalidatePath(path);
    return { ok: true };
  } catch (e) {
    if (e instanceof TimesheetError) return { ok: false, error: e.message };
    logError("approvals", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
