import { logError } from "./log";
import { isMonday, isYmd } from "./dates";

/** An error whose message is safe to show to the user as-is. */
export class TimesheetError extends Error {
  /** "conflict" = the data changed on the server (e.g. an admin approved the week). */
  code?: "conflict";
  constructor(message: string, code?: "conflict") {
    super(message);
    this.name = "TimesheetError";
    this.code = code;
  }
}

type DbError = { code?: string; message: string; details?: string | null };

/**
 * Turn a Supabase/Postgres error into a TimesheetError with plain words.
 * `fallback` is used when we don't recognise the error. Raw details are logged on the server only.
 */
export function toError(error: DbError, fallback: string): TimesheetError {
  const text = `${error.message} ${error.details ?? ""}`;

  switch (error.code) {
    case "P0001": // a rule raised by our own database functions/triggers; the message is already plain
      return new TimesheetError(error.message);
    case "23P01": // exclusion_violation
      if (text.includes("requests_no_overlap")) {
        return new TimesheetError("You already have a request that overlaps these dates.");
      }
      break;
    case "42501": // RLS / permission denied
      return new TimesheetError(
        "You don't have permission to do that. The week may already be submitted or approved.",
        "conflict"
      );
    case "23514": // check_violation
      if (text.includes("requests_check")) {
        return new TimesheetError("The end date can't be before the start date.");
      }
      if (text.includes("week_start")) {
        return new TimesheetError("A week must start on a Monday.");
      }
      return new TimesheetError("One of the values is out of range. Hours must be between 0 and 24.");
    case "23505": // unique_violation
      if (text.includes("timesheet_rows_week_project_key")) {
        return new TimesheetError("That project is already in this week.");
      }
      return new TimesheetError("That already exists.");
    case "23503": // foreign_key_violation
      return new TimesheetError("That item no longer exists. Please refresh and try again.");
    case "22P02": // invalid_text_representation (bad uuid etc.)
      return new TimesheetError("That request wasn't valid. Please refresh and try again.");
  }

  if (/jwt|not authenticated/i.test(error.message)) {
    return new TimesheetError("Your session has expired. Please sign in again.");
  }
  if (/fetch failed|network/i.test(error.message)) {
    return new TimesheetError("Couldn't reach the server. Check your connection and try again.");
  }

  logError("timesheet db", error);
  return new TimesheetError(fallback);
}

// ---------- Input checks (never trust values that came from the browser) ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertId(value: unknown, label = "item"): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TimesheetError(`That ${label} isn't valid. Please refresh and try again.`);
  }
  return value;
}

export function assertDate(value: unknown, label = "date"): string {
  if (!isYmd(value)) throw new TimesheetError(`Please enter a valid ${label}.`);
  return value;
}

export function assertWeekStart(value: unknown): string {
  const ymd = assertDate(value, "week");
  if (!isMonday(ymd)) throw new TimesheetError("A week must start on a Monday.");
  return ymd;
}

export function assertHours(value: unknown, label = "Hours"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 24) {
    throw new TimesheetError(`${label} must be a number between 0 and 24.`);
  }
  return Math.round(value * 100) / 100;
}
