// The settings an admin can change (Admin -> Settings), held where the rest of the code can read them without waiting.
// Plain code with no server-only imports: the server and the browser each keep their own copy, and each is filled in from the
// database before pages use it (the server in getCurrentUser, the browser by <SettingsProvider> in the portal layout).
//
// This is a deliberate shortcut: "is this day a weekly off?" is asked from dozens of places that can't wait for a database call.
// The settings are the same for everyone, so one shared copy is safe; it only ever changes when an admin saves new ones.

export type PortalSettings = {
  /** Hours a full working day is expected to have. */
  dailyTargetHours: number;
  /** Weekly off days as ISO weekdays: 1 = Monday ... 7 = Sunday. */
  weeklyOffDays: number[];
  /** Employees can't add, change or delete time logs dated on or before this day (YYYY-MM-DD), or null for no admin lock. */
  lockedThrough: string | null;
};

export const DEFAULT_SETTINGS: PortalSettings = { dailyTargetHours: 8, weeklyOffDays: [6, 7], lockedThrough: null };

export const WEEKDAYS = [
  { iso: 1, short: "Mon", long: "Monday" },
  { iso: 2, short: "Tue", long: "Tuesday" },
  { iso: 3, short: "Wed", long: "Wednesday" },
  { iso: 4, short: "Thu", long: "Thursday" },
  { iso: 5, short: "Fri", long: "Friday" },
  { iso: 6, short: "Sat", long: "Saturday" },
  { iso: 7, short: "Sun", long: "Sunday" },
] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Turn whatever came from the database (or a form) into settings that are safe to use; anything odd falls back to the defaults. */
export function cleanSettings(raw: { dailyTargetHours?: unknown; weeklyOffDays?: unknown; lockedThrough?: unknown } | null | undefined): PortalSettings {
  const target = Number(raw?.dailyTargetHours);
  const days = Array.isArray(raw?.weeklyOffDays) ? [...new Set((raw.weeklyOffDays as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b) : null;
  const locked = typeof raw?.lockedThrough === "string" && YMD.test(raw.lockedThrough) ? raw.lockedThrough : null;
  return {
    dailyTargetHours: Number.isFinite(target) && target > 0 && target <= 24 ? Math.round(target * 100) / 100 : DEFAULT_SETTINGS.dailyTargetHours,
    // At least one day must stay a working day; six or fewer off days.
    weeklyOffDays: days && days.length <= 6 ? days : [...DEFAULT_SETTINGS.weeklyOffDays],
    lockedThrough: locked,
  };
}

let current: PortalSettings = DEFAULT_SETTINGS;

/** Use these settings from now on. */
export function applySettings(raw: Parameters<typeof cleanSettings>[0]): void {
  current = cleanSettings(raw);
}

export const currentSettings = (): PortalSettings => current;
/** The hours a full working day is expected to have. */
export const dailyTarget = (): number => current.dailyTargetHours;
/** Is this ISO weekday (1 = Monday ... 7 = Sunday) a weekly off? */
export const isWeeklyOff = (isoWeekday: number): boolean => current.weeklyOffDays.includes(isoWeekday);
/** The last day locked by an admin, or null. */
export const lockedThroughDate = (): string | null => current.lockedThrough;

/** "Saturday and Sunday", "Friday, Saturday and Sunday", "No days". */
export function offDaysText(days: readonly number[]): string {
  const names = WEEKDAYS.filter((d) => days.includes(d.iso)).map((d) => d.long);
  if (names.length === 0) return "No days";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
