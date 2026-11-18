import { addDays, mondayOf } from "./dates";

// Shared by the server and the browser (no server-only code here).

// The timesheet is weekly, Monday to Sunday in office time (Asia/Kolkata). It locks every Sunday night: from Monday 00:00 the
// week that just ended can no longer be added to, changed or deleted by employees. Only the current week (Monday up to
// today; never the future) is open. Admins can still correct any day.
// The same rule is in supabase/step29_weekly_lock.sql, which is what really enforces it in the database.

/** The oldest date that can still be added or changed today: this week's Monday. */
export const earliestEditable = (today: string) => mondayOf(today);

/** Is a log for this date in a week that has already locked? */
export const isLocked = (logDate: string, today: string) => logDate < earliestEditable(today);

/** The Sunday the current week ends, and so locks at the end of. */
export const lockDate = (today: string) => addDays(mondayOf(today), 6);

export const LOCKED_MESSAGE = "Timesheets lock every Sunday night. Only the current week (Monday to Sunday) can be added to or changed, so that day is locked. Ask an admin if it needs a correction.";

/** "Copy yesterday's entries" looks back this many days for entries to copy. That is only reading: the copies go to today. */
export const COPY_LOOKBACK_DAYS = 7;
