import { addDays, mondayOf } from "./dates";
import { lockedThroughDate } from "./settings";

// Shared by the server and the browser (no server-only code here).

// The timesheet is weekly, Monday to Sunday in office time (Asia/Kolkata). It locks every Sunday night: from Monday 00:00 the
// week that just ended can no longer be added to, changed or deleted by employees. Only the current week (Monday up to
// today; never the future) is open. An admin can also lock everything up to a date (Admin -> Settings), which closes an
// earlier part of the current week too. Admins can still correct any day.
// The same rules are in supabase/step29_weekly_lock.sql and step32_settings.sql, which is what really enforces them in the database.

/** The oldest date that can still be added or changed today: this week's Monday, or the day after an admin lock if that is later. */
export function earliestEditable(today: string): string {
  const monday = mondayOf(today);
  const locked = lockedThroughDate();
  if (!locked) return monday;
  const after = addDays(locked, 1);
  return after > monday ? after : monday;
}

/** Is a log for this date locked (its week has ended, or an admin has locked up to or past it)? */
export const isLocked = (logDate: string, today: string) => logDate < earliestEditable(today);

/** The Sunday the current week ends, and so locks at the end of. */
export const lockDate = (today: string) => addDays(mondayOf(today), 6);

export const LOCKED_MESSAGE =
  "Timesheets lock every Sunday night, and an admin can lock earlier days too. Only the current week, after any admin lock, can be added to or changed, so that day is locked. Ask an admin if it needs a correction.";

/** "Copy yesterday's entries" looks back this many days for entries to copy. That is only reading: the copies go to today. */
export const COPY_LOOKBACK_DAYS = 7;
