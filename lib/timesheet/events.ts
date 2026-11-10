import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { TimesheetError, assertDate, assertId, toError } from "./errors";
import { listLogsBetween } from "./logs";
import { displayName } from "./people";
import { holidayTypeLabel, isDayOff } from "./holidayTypes";
import { listHolidaysBetween } from "./holidays";
import { listApprovedRequestsBetween } from "./requests";
import { logError } from "./log";
import { EVENT_COLORS, STORED_CALENDARS, type EventColor, type EventInput, type EventItem } from "./eventTypes";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

// Who sees what is decided by row level security in the database (supabase/step15_calendar_events.sql):
// personal events only reach their owner, everything else reaches every signed-in person.

/** Everything to draw for these dates: saved events plus leave and attendance built from existing data. */
export async function loadEvents(from: string, to: string): Promise<{ items: EventItem[]; warnings: string[] }> {
  assertDate(from, "start date");
  assertDate(to, "end date");
  const me = await requireUser();
  const isAdmin = me.role === "admin";
  const scope = isAdmin ? "all" : "mine";
  const supabase = await db();
  const warnings: string[] = [];
  const items: EventItem[] = [];

  const [stored, leave, logs, holidays] = await Promise.allSettled([
    supabase
      .from("calendar_events")
      .select("*, owner:profiles!calendar_events_owner_id_fkey(full_name, email)")
      .lte("starts_on", to)
      .gte("ends_on", from)
      .order("starts_on", { ascending: true })
      .limit(1000),
    listApprovedRequestsBetween({ scope, from, to }),
    listLogsBetween({ scope, from, to }),
    listHolidaysBetween(from, to),
  ]);

  if (stored.status === "fulfilled" && !stored.value.error) {
    for (const r of stored.value.data) {
      items.push({
        id: r.id,
        calendar: r.calendar as EventItem["calendar"],
        title: r.title,
        description: r.description ?? "",
        location: r.location ?? "",
        link: r.meeting_link ?? "",
        color: (EVENT_COLORS.some((c) => c.id === r.color) ? r.color : "black") as EventColor,
        start: r.starts_on,
        end: r.ends_on,
        startTime: hhmm(r.start_time),
        endTime: hhmm(r.end_time),
        allDay: r.start_time === null,
        ownerId: r.owner_id,
        ownerName: displayName(r.owner),
        derived: false,
      });
    }
  } else {
    // Most likely the SQL step hasn't been run yet.
    const reason = stored.status === "rejected" ? stored.reason : stored.value.error;
    logError("events", reason);
    warnings.push("Couldn't load events. Please try again.");
  }

  if (holidays.status === "fulfilled") {
    for (const h of holidays.value) {
      items.push({
        id: `hol-${h.id}`,
        calendar: "holiday",
        title: h.name,
        description: [holidayTypeLabel(h.type), h.description].filter(Boolean).join(". "),
        location: "",
        link: "",
        color: isDayOff(h.type) ? "gray" : "outline",
        start: h.date,
        end: h.date,
        startTime: "",
        endTime: "",
        allDay: true,
        ownerId: "",
        ownerName: "",
        derived: true,
      });
    }
  } else {
    logError("events-holidays", holidays.reason);
    warnings.push("Couldn't load holidays.");
  }

  if (leave.status === "fulfilled") {
    for (const r of leave.value) {
      const who = displayName(r.owner);
      const label = r.comp_off ? "Comp-off" : r.type === "leave" ? "Leave" : "WFH";
      items.push({
        id: `req-${r.id}`,
        calendar: "leave",
        title: isAdmin ? `${who} · ${label}` : label,
        description: r.reason ?? "",
        location: "",
        link: "",
        color: r.type === "leave" && !r.comp_off ? "gray" : "outline",
        start: r.from_date,
        end: r.to_date,
        startTime: "",
        endTime: "",
        allDay: true,
        ownerId: r.user_id,
        ownerName: who,
        derived: true,
      });
    }
  } else {
    logError("events-leave", leave.reason);
    warnings.push("Couldn't load leave.");
  }

  if (logs.status === "fulfilled") {
    // One entry per day: your own hours, or for admins how many people logged time.
    const byDay = new Map<string, Map<string, { name: string; hours: number }>>();
    for (const l of logs.value) {
      if (l.status === "rejected") continue;
      const day = byDay.get(l.log_date) ?? new Map();
      const person = day.get(l.user_id) ?? { name: displayName(l.owner), hours: 0 };
      person.hours += l.hours ?? 0;
      day.set(l.user_id, person);
      byDay.set(l.log_date, day);
    }
    for (const [date, people] of byDay) {
      const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
      const total = Math.round(list.reduce((n, p) => n + p.hours, 0) * 100) / 100;
      items.push({
        id: `att-${date}`,
        calendar: "attendance",
        title: isAdmin ? `${list.length} ${list.length === 1 ? "person" : "people"} logged time` : `${total} h logged`,
        description: isAdmin ? list.map((p) => `${p.name}: ${Math.round(p.hours * 100) / 100} h`).join("\n") : "",
        location: "",
        link: "",
        color: "light",
        start: date,
        end: date,
        startTime: "",
        endTime: "",
        allDay: true,
        ownerId: me.id,
        ownerName: "",
        derived: true,
      });
    }
  } else {
    logError("events-attendance", logs.reason);
    warnings.push("Couldn't load attendance.");
  }

  return { items, warnings };
}

// ---------------------------- Create, change, delete ----------------------------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(input: EventInput) {
  if (!STORED_CALENDARS.includes(input?.calendar)) throw new TimesheetError("Choose a calendar for this event.");
  const title = String(input.title ?? "").trim();
  if (!title) throw new TimesheetError("Give the event a title.");
  if (title.length > 200) throw new TimesheetError("Keep the title to 200 characters or fewer.");

  const startDate = assertDate(input.startDate, "start date");
  const endDate = assertDate(input.endDate, "end date");
  if (endDate < startDate) throw new TimesheetError("The end can't be before the start.");

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (!input.allDay) {
    if (!TIME.test(input.startTime ?? "")) throw new TimesheetError("Enter a start time.");
    if (!TIME.test(input.endTime ?? "")) throw new TimesheetError("Enter an end time.");
    if (endDate === startDate && input.endTime <= input.startTime) {
      throw new TimesheetError("The end time must be after the start time.");
    }
    startTime = input.startTime;
    endTime = input.endTime;
  }

  const description = String(input.description ?? "").trim();
  if (description.length > 2000) throw new TimesheetError("Keep the description to 2000 characters or fewer.");
  const location = String(input.location ?? "").trim();
  if (location.length > 200) throw new TimesheetError("Keep the location to 200 characters or fewer.");
  const link = String(input.link ?? "").trim();
  if (link && (link.length > 500 || !/^https?:\/\//i.test(link))) {
    throw new TimesheetError("The meeting link must start with http:// or https://.");
  }
  if (!EVENT_COLORS.some((c) => c.id === input.color)) throw new TimesheetError("Choose one of the colours.");

  return {
    calendar: input.calendar,
    title,
    description: description || null,
    location: location || null,
    meeting_link: link || null,
    color: input.color,
    starts_on: startDate,
    ends_on: endDate,
    start_time: startTime,
    end_time: endTime,
  };
}

/** Personal events are anyone's own; every other calendar is for admins. The database enforces the same rule. */
const requireFor = (calendar: string) => (calendar === "personal" ? requireUser() : requireAdmin());

export async function createEvent(input: EventInput): Promise<void> {
  const row = clean(input);
  const me = await requireFor(row.calendar);
  const supabase = await db();
  const { error } = await supabase.from("calendar_events").insert({ ...row, owner_id: me.id });
  if (error) throw toError(error, "Couldn't save the event. Please try again.");
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  assertId(id, "event");
  const row = clean(input);
  await requireFor(row.calendar);
  const supabase = await db();
  const { data, error } = await supabase.from("calendar_events").update(row).eq("id", id).select("id").maybeSingle();
  if (error) throw toError(error, "Couldn't save the event. Please try again.");
  if (!data) throw new TimesheetError("You can't change that event, or it no longer exists.");
}

export async function deleteEvent(id: string): Promise<void> {
  assertId(id, "event");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase.from("calendar_events").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw toError(error, "Couldn't delete the event. Please try again.");
  if (!data) throw new TimesheetError("You can't delete that event, or it no longer exists.");
}
