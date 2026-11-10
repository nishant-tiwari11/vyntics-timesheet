// Shared by the server and the browser (no server-only code here).

export type HolidayType = "public" | "optional" | "festival";

export const HOLIDAY_TYPES: { id: HolidayType; label: string; hint: string }[] = [
  { id: "public", label: "Public holiday", hint: "A day off for everyone" },
  { id: "festival", label: "Festival", hint: "A festival day, treated as a day off" },
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
};

export type HolidayInput = { name: string; date: string; type: HolidayType; description: string };

/** Public holidays and festival days are not working days: no hours are expected and they are not leave. */
export const isDayOff = (type: HolidayType) => type === "public" || type === "festival";
