"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/avatar";
import { signingImageStatus } from "@/lib/documents/signingAssets";
import { newLetter } from "@/lib/offers/defaults";
import { deleteOffer, getOffer, listOffers, loadOfferSettings, saveOffer, saveOfferSettings, sendOffer, type OfferDetail, type OfferRow, type OfferSettings } from "@/lib/offers/server";
import { emptyLetter, type LetterData } from "@/lib/offers/types";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { todayInOffice } from "@/lib/timesheet/dates";
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
  for (const p of ["/timesheet/admin/audit", "/timesheet/admin/documents", "/timesheet/profile"]) revalidatePath(p);
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

// ---------------------------------------------------------------- reading, for the Offer letter tab in Admin > Documents
type Read<T> = ({ ok: true } & T) | { ok: false; error: string };

async function denied(): Promise<string | null> {
  const me = await getCurrentUser();
  if (!me) return "Please sign in again.";
  return me.role === "admin" ? null : "Only admins can do that.";
}
const failRead = (e: unknown): { ok: false; error: string } => {
  const r = fail(e);
  return { ok: false, error: r.ok ? "Something went wrong." : r.error };
};

export async function loadOfferListAction(filter: { type?: string; status?: string; q?: string }): Promise<Read<{ ready: boolean; rows: OfferRow[]; truncated: boolean }>> {
  const no = await denied();
  if (no) return { ok: false, error: no };
  try {
    return { ok: true, ...(await listOffers(filter)) };
  } catch (e) {
    return failRead(e);
  }
}

export async function loadOfferSettingsAction(): Promise<Read<{ settings: OfferSettings; pictures: { logo: boolean; signature: boolean; seal: boolean } }>> {
  const no = await denied();
  if (no) return { ok: false, error: no };
  try {
    const [settings, pictures] = await Promise.all([loadOfferSettings(), signingImageStatus().catch(() => ({ signature: false, seal: false, logo: false }))]);
    return { ok: true, settings, pictures };
  } catch (e) {
    return failRead(e);
  }
}

export async function loadOfferAction(id: string): Promise<Read<{ detail: OfferDetail; initial: LetterData }>> {
  const no = await denied();
  if (no) return { ok: false, error: no };
  try {
    const found = await getOffer(id);
    if (!found) return { ok: false, error: "That letter could not be found." };
    // What was saved, over the defaults (an older letter may lack a newer detail).
    const initial: LetterData = { ...emptyLetter(todayInOffice()), ...found.data, phases: found.data.phases ?? [], salaryBreakup: found.data.salaryBreakup ?? [] };
    return { ok: true, detail: found, initial };
  } catch (e) {
    return failRead(e);
  }
}

/** A new letter for a person: their name and email filled in from their record. */
export async function loadNewOfferAction(userId: string): Promise<Read<{ name: string; initial: LetterData }>> {
  const no = await denied();
  if (no) return { ok: false, error: no };
  if (!isUuid(userId)) return { ok: false, error: "Choose the employee." };
  try {
    const supabase = await createClient();
    const { data: person } = await supabase.from("profiles").select("full_name, email, manager_id").eq("id", userId).maybeSingle();
    if (!person) return { ok: false, error: "That person could not be found." };
    const manager = person.manager_id ? (await supabase.from("profiles").select("full_name, email").eq("id", person.manager_id).maybeSingle()).data : null;
    const name = person.full_name?.trim() || person.email.split("@")[0];
    return { ok: true, name, initial: newLetter(todayInOffice(), { name, email: person.email, manager: manager ? manager.full_name?.trim() || manager.email.split("@")[0] : "" }) };
  } catch (e) {
    return failRead(e);
  }
}
