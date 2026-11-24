"use server";

import { revalidatePath } from "next/cache";
import { deleteOffer, saveOffer, saveOfferSettings, sendOffer } from "@/lib/offers/server";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Offer letters, admin side. The role is checked inside each function (lib/offers/server.ts) and again by the database, which
// also writes every create, edit, send and settings change to the audit log.
export type OfferResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(e: unknown): OfferResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("offer letters", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}
const refresh = () => {
  for (const p of ["/timesheet/admin/offers", "/timesheet/admin/audit", "/timesheet/admin/documents", "/timesheet/profile"]) revalidatePath(p);
};

/** Save a draft, or (when the letter was already sent) create its next draft version. Returns the id to open. */
export async function saveOfferAction(id: string | null, userId: string, input: unknown): Promise<OfferResult> {
  try {
    const saved = await saveOffer(id, userId, input);
    refresh();
    return { ok: true, id: saved };
  } catch (e) {
    return fail(e);
  }
}

export async function sendOfferAction(id: string): Promise<OfferResult> {
  try {
    await sendOffer(id);
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOfferAction(id: string): Promise<OfferResult> {
  try {
    await deleteOffer(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveOfferSettingsAction(company: unknown, clauses: unknown): Promise<OfferResult> {
  try {
    await saveOfferSettings(company, clauses);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
