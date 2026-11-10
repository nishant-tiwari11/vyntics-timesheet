// Shared by the server and the browser (no server-only code here).

export type CalendarId = "personal" | "company" | "holiday" | "meeting" | "project" | "attendance" | "leave";

/** The calendars people can create events in. The others are built from existing data and are read-only. */
export type StoredCalendar = "personal" | "company" | "holiday" | "meeting" | "project";

export const STORED_CALENDARS: StoredCalendar[] = ["personal", "company", "holiday", "meeting", "project"];

export type EventColor = "black" | "slate" | "gray" | "light" | "outline";
export const EVENT_COLORS: { id: EventColor; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "slate", label: "Dark gray" },
  { id: "gray", label: "Gray" },
  { id: "light", label: "Light gray" },
  { id: "outline", label: "Outline" },
];

export type CalendarInfo = {
  id: CalendarId;
  label: string;
  /** The colour new events in this calendar start with. */
  color: EventColor;
  /** Who may create and change events here: their owner only, admins only, or nobody (built from other data). */
  edit: "owner" | "admin" | "none";
};

export const CALENDARS: CalendarInfo[] = [
  { id: "personal", label: "My calendar", color: "black", edit: "owner" },
  { id: "company", label: "Company calendar", color: "slate", edit: "admin" },
  { id: "holiday", label: "Holidays", color: "gray", edit: "none" },
  { id: "attendance", label: "Attendance", color: "light", edit: "none" },
  { id: "leave", label: "Leaves", color: "gray", edit: "none" },
  { id: "meeting", label: "Meetings", color: "slate", edit: "admin" },
  { id: "project", label: "Projects and deadlines", color: "black", edit: "admin" },
];

export const calendarLabel = (id: CalendarId) => CALENDARS.find((c) => c.id === id)?.label ?? id;

/** One thing on the calendar, from a saved event or built from leave or attendance. */
export type EventItem = {
  id: string;
  calendar: CalendarId;
  title: string;
  description: string;
  location: string;
  link: string;
  color: EventColor;
  /** First and last day (YYYY-MM-DD, inclusive). */
  start: string;
  end: string;
  /** "HH:MM" in office time; both empty for an all-day event. */
  startTime: string;
  endTime: string;
  allDay: boolean;
  ownerId: string;
  ownerName: string;
  /** Built from other data (leave, attendance): shown, never edited here. */
  derived: boolean;
};

/** What the form sends when creating or changing an event. */
export type EventInput = {
  calendar: StoredCalendar;
  title: string;
  description: string;
  location: string;
  link: string;
  color: EventColor;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};
