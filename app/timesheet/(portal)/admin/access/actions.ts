"use server";

import { revalidatePath } from "next/cache";
import { addMany, addUser, removeUser, resetPassword, setManager, updateUser } from "@/lib/access/server";
import type { AddUserInput } from "@/lib/access/schemas";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Admins only: each function ends up in lib/access/server.ts, which checks for an admin on the server, and the database
// functions check again. Passwords go straight through to the database and are never logged.
export type AccessResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(e: unknown): AccessResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("access", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/timesheet/admin/access");

export async function addUserAction(input: AddUserInput): Promise<AccessResult> {
  try {
    await addUser(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addManyAction(input: unknown): Promise<AccessResult> {
  try {
    const { added, failed } = await addMany(input);
    refresh();
    if (failed.length > 0) return { ok: false, error: `Added ${added}. ${failed.length} failed: ${failed.slice(0, 3).join(" ")}${failed.length > 3 ? " ..." : ""}` };
    return { ok: true, message: `Added ${added} ${added === 1 ? "person" : "people"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(input: unknown): Promise<AccessResult> {
  try {
    await updateUser(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeUserAction(email: string): Promise<AccessResult> {
  try {
    await removeUser(email);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPasswordAction(input: unknown): Promise<AccessResult> {
  try {
    await resetPassword(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setManagerAction(email: string, managerEmail: string): Promise<AccessResult> {
  try {
    await setManager(email, managerEmail);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
