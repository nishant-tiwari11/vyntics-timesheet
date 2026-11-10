"use server";

import { revalidatePath } from "next/cache";
import { createEvent, deleteEvent, updateEvent } from "@/lib/timesheet/events";
import type { EventInput } from "@/lib/timesheet/eventTypes";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

export type EventResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): EventResult {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("events", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/timesheet/events");

export async function createEventAction(input: EventInput): Promise<EventResult> {
  try {
    await createEvent(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateEventAction(id: string, input: EventInput): Promise<EventResult> {
  try {
    await updateEvent(id, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEventAction(id: string): Promise<EventResult> {
  try {
    await deleteEvent(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
