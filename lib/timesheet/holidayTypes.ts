// Shared by the server and the browser (no server-only code here).

export type HolidayType = "public" | "optional" | "festival";

export const HOLIDAY_TYPES: { id: HolidayType; label: string; hint: string }[] = [
  { id: "public", label: "Public holiday", hint: "On the calendar. An admin decides if the office is closed" },
  { id: "festival", label: "Festival", hint: "On the calendar. An admin decides if the office is closed" },
  { id: "optional", label: "Optional", hint: "A normal working day people may choose to take off" },
];

export const holidayTypeLabel = (t: HolidayType) => HOLIDAY_TYPES.find((h) => h.id === t)?.label ?? t;

export type Holiday = {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  type: HolidayType;
  description: string;
  year: number;
  /** An admin has checked this date against the official list. Festival dates change every year. */
  reviewed: boolean;
  /** The office is closed that day: no hours are expected, it is not leave, and it is paid. Only an admin's decision makes it so. */
  officeOff: boolean;
  /** An admin has decided (closed or open). Until then a public holiday or festival is an ordinary working day. */
  decided: boolean;
};

export type HolidayInput = { name: string; date: string; type: HolidayType; description: string; /** Is the office closed? */ officeOff?: boolean };

/** A holiday or festival is on the calendar for everyone, but it only stops being a working day when an admin closes the office. */
export const isDayOff = (h: Pick<Holiday, "officeOff">) => h.officeOff;

/** A public holiday or festival that nobody has decided on yet: the admin is asked whether the office is closed. */
export const needsDecision = (h: Pick<Holiday, "type" | "decided">) => !h.decided && (h.type === "public" || h.type === "festival");
