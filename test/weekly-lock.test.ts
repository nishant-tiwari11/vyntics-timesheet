import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COPY_LOOKBACK_DAYS, LOCKED_MESSAGE, earliestEditable, isLocked, lockDate } from "@/lib/timesheet/rules";

// The timesheet locks every Sunday night (office time): from Monday the week that ended can't be changed by employees.

describe("weekly lock", () => {
  // Week of Mon 9 Nov to Sun 15 Nov 2026.
  const weekdays = [
    ["Monday", "2026-11-09"],
    ["Tuesday", "2026-11-10"],
    ["Wednesday", "2026-11-11"],
    ["Thursday", "2026-11-12"],
    ["Friday", "2026-11-13"],
    ["Saturday", "2026-11-14"],
    ["Sunday", "2026-11-15"],
  ] as const;

  it.each(weekdays)("on %s the current week is open back to Monday", (_name, today) => {
    expect(earliestEditable(today)).toBe("2026-11-09");
    expect(isLocked("2026-11-09", today)).toBe(false);
    expect(isLocked(today, today)).toBe(false);
    expect(lockDate(today)).toBe("2026-11-15");
  });

  it.each(weekdays)("on %s last week is locked, including its Sunday", (_name, today) => {
    expect(isLocked("2026-11-08", today)).toBe(true); // last Sunday
    expect(isLocked("2026-11-02", today)).toBe(true); // last Monday
  });

  it("locks the moment Sunday night ends: on Monday the whole previous week is closed", () => {
    expect(isLocked("2026-11-15", "2026-11-15")).toBe(false); // Sunday evening: still open
    expect(isLocked("2026-11-15", "2026-11-16")).toBe(true); // Monday 00:00: locked
    expect(isLocked("2026-11-09", "2026-11-16")).toBe(true);
    expect(isLocked("2026-11-16", "2026-11-16")).toBe(false); // the new week is open
  });

  it("works across a month and year end", () => {
    expect(earliestEditable("2027-01-01")).toBe("2026-12-28"); // a Friday: its Monday is in the old year
    expect(isLocked("2026-12-27", "2027-01-01")).toBe(true);
    expect(isLocked("2026-12-28", "2027-01-01")).toBe(false);
  });

  it("explains itself", () => {
    expect(LOCKED_MESSAGE).toMatch(/Sunday night/);
    expect(COPY_LOOKBACK_DAYS).toBeGreaterThanOrEqual(6); // copying reads back across the lock; the copies go to today
  });
});

// The rule that really protects the data is in the database, so check the migration still spells it out.
describe("supabase/step29_weekly_lock.sql", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "..", "supabase/step29_weekly_lock.sql"), "utf8");
  it("limits employees to the current week in every policy", () => {
    expect(sql).toMatch(/create policy "logs: insert own this week"/);
    expect(sql).toMatch(/create policy "logs: delete own pending this week"/);
    expect(sql).toMatch(/create policy "logs: update own pending this week"/);
    expect(sql.match(/date_trunc\('week', public\.portal_today\(\)\)::date/g)!.length).toBe(4); // insert, delete, and the update's using + with check
  });
  it("removes the old 7-day policies and leaves admins alone", () => {
    expect(sql).toMatch(/drop policy if exists "logs: insert own within 7 days"/);
    expect(sql).toMatch(/drop policy if exists "logs: delete own pending within 7 days"/);
    expect(sql).toMatch(/drop policy if exists "logs: update own pending within 7 days"/);
    expect(sql).not.toMatch(/create policy "logs: admin/); // admin policies from step 19 stay as they are
  });
});
