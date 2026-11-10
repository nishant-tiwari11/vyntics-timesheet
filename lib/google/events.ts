import "server-only";
import { addDays } from "@/lib/timesheet/dates";
import { GoogleError, googleFetch } from "./http";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Marks events the portal created, so they are never shown a second time as "Google events". */
export const OWN_EVENT_KEY = "vynticsRequest";

export type AllDayEvent = {
  summary: string;
  description: string;
  from: string; // first day, YYYY-MM-DD
  to: string; // last day (inclusive), YYYY-MM-DD
  busy: boolean;
  requestId: string;
};

export type GoogleEvent = { id: string; title: string; from: string; to: string; allDay: boolean };

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers };
  let res = await googleFetch(url, { ...init, headers });
  // Google also reports per-user rate limits as 403; wait a second and try once more.
  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
    if (body?.error?.errors?.some((e) => /ratelimit/i.test(e.reason ?? ""))) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await googleFetch(url, { ...init, headers });
    }
  }
  return res;
}

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  throw new GoogleError(body?.error?.message ?? `Google Calendar couldn't ${what}.`, res.status, res.status === 401);
}

function payload(e: AllDayEvent) {
  return {
    summary: e.summary,
    description: e.description,
    start: { date: e.from },
    end: { date: addDays(e.to, 1) }, // Google's all-day end date is exclusive
    transparency: e.busy ? "opaque" : "transparent",
    extendedProperties: { private: { [OWN_EVENT_KEY]: e.requestId } },
  };
}

export async function createEvent(token: string, e: AllDayEvent): Promise<string> {
  const res = await call(token, API, { method: "POST", body: JSON.stringify(payload(e)) });
  if (!res.ok) await fail(res, "create the event");
  return ((await res.json()) as { id: string }).id;
}

/** Update an event. Returns false when it no longer exists in Google (deleted there), so the caller can recreate it. */
export async function updateEvent(token: string, id: string, e: AllDayEvent): Promise<boolean> {
  const res = await call(token, `${API}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload(e)) });
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) await fail(res, "update the event");
  return true;
}

/** Delete an event. An event that is already gone counts as deleted. */
export async function deleteEvent(token: string, id: string): Promise<void> {
  const res = await call(token, `${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status === 404 || res.status === 410 || res.ok) return;
  await fail(res, "delete the event");
}

/** The person's own events between two dates (inclusive), without the ones this portal created. */
export async function listEvents(token: string, from: string, to: string): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: `${from}T00:00:00+05:30`,
    timeMax: `${addDays(to, 1)}T00:00:00+05:30`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: "items(id,status,summary,start,end,extendedProperties/private)",
  });
  const res = await call(token, `${API}?${params}`);
  if (!res.ok) await fail(res, "load your events");
  const json = (await res.json()) as {
    items?: {
      id: string;
      status?: string;
      summary?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
      extendedProperties?: { private?: Record<string, string> };
    }[];
  };
  const out: GoogleEvent[] = [];
  for (const item of json.items ?? []) {
    if (item.status === "cancelled" || item.extendedProperties?.private?.[OWN_EVENT_KEY]) continue;
    const start = item.start?.date ?? item.start?.dateTime?.slice(0, 10);
    const rawEnd = item.end?.date ?? item.end?.dateTime?.slice(0, 10);
    if (!start || !rawEnd) continue;
    const allDay = !!item.start?.date;
    // All-day ends are exclusive, so the last visible day is the day before.
    const last = allDay ? addDays(rawEnd, -1) : rawEnd;
    out.push({ id: item.id, title: item.summary?.trim() || "Busy", from: start, to: last < start ? start : last, allDay });
  }
  return out;
}
