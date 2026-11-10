import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { isYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { loadEvents } from "@/lib/timesheet/events";
import type { EventItem } from "@/lib/timesheet/eventTypes";
import { logError } from "@/lib/timesheet/log";
import EventsApp from "./EventsApp";
import { VIEWS, rangeFor, type EventsQuery } from "./eventsQuery";

export const metadata = { title: "Events" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, raw] = await Promise.all([getCurrentUser(), searchParams]);
  const today = todayInOffice();
  const onRaw = one(raw.on);
  const q: EventsQuery = {
    view: VIEWS.find((v) => v.id === one(raw.view))?.id ?? "month",
    on: isYmd(onRaw) ? onRaw : today,
  };

  let items: EventItem[] = [];
  let warnings: string[] = [];
  try {
    const { from, to } = rangeFor(q);
    ({ items, warnings } = await loadEvents(from, to));
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("events", e);
    warnings = [e instanceof TimesheetError ? e.message : "Couldn't load events. Please try again."];
  }

  return <EventsApp items={items} warnings={warnings} q={q} today={today} isAdmin={user?.role === "admin"} myId={user?.id ?? ""} />;
}
