import { addDays } from "./dates";

// Shared by the server and the browser (no server-only code here).

/** An employee can add, edit or delete a time log for this many days after its date. Then the day is locked.
 *  The same number is in supabase/step19_timesheet_window.sql, which is what really enforces it. */
export const EDIT_WINDOW_DAYS = 7;

/** The oldest date that can still be added or changed today. */
export const earliestEditable = (today: string) => addDays(today, -EDIT_WINDOW_DAYS);

/** Is a log for this date past the 7-day window? */
export const isLocked = (logDate: string, today: string) => logDate < earliestEditable(today);

export const LOCKED_MESSAGE = `Time logs can only be added or changed for the last ${EDIT_WINDOW_DAYS} days. That day is locked.`;
