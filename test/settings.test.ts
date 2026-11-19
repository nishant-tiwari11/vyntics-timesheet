import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildHoursTable, buildUnderTargetTable, expectedWorkingDays } from "@/lib/admin/reportsModel";
import { addDays, isWeekend, workingDays } from "@/lib/timesheet/dates";
import { LOCKED_MESSAGE, earliestEditable, isLocked } from "@/lib/timesheet/rules";
import { DEFAULT_SETTINGS, applySettings, cleanSettings, currentSettings, dailyTarget, offDaysText } from "@/lib/timesheet/settings";

// Tests change the shared settings, so every test puts them back.
afterEach(() => applySettings(DEFAULT_SETTINGS));

// Week of Mon 9 Nov to Sun 15 Nov 2026.
const MON = "2026-11-09";
const FRI = "2026-11-13";
const SAT = "2026-11-14";
const SUN = "2026-11-15";

describe("cleanSettings", () => {
  it("keeps good values", () => {
    expect(cleanSettings({ dailyTargetHours: "7.5", weeklyOffDays: [7, 6, 6], lockedThrough: "2026-11-08" })).toEqual({ dailyTargetHours: 7.5, weeklyOffDays: [6, 7], lockedThrough: "2026-11-08" });
  });
  it("falls back to the defaults for anything unsafe", () => {
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ dailyTargetHours: 0, weeklyOffDays: "x", lockedThrough: "tomorrow" })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ dailyTargetHours: 99 }).dailyTargetHours).toBe(8);
    expect(cleanSettings({ dailyTargetHours: Number.NaN }).dailyTargetHours).toBe(8);
  });
  it("never lets every day be an off day, and drops days that aren't weekdays", () => {
    expect(cleanSettings({ weeklyOffDays: [1, 2, 3, 4, 5, 6, 7] }).weeklyOffDays).toEqual([6, 7]);
    expect(cleanSettings({ weeklyOffDays: [0, 8, 3.5, 5] }).weeklyOffDays).toEqual([5]);
    expect(cleanSettings({ weeklyOffDays: [] }).weeklyOffDays).toEqual([]); // no weekly off at all is allowed
  });
  it("describes the days in words", () => {
    expect(offDaysText([6, 7])).toBe("Saturday and Sunday");
    expect(offDaysText([5, 6, 7])).toBe("Friday, Saturday and Sunday");
    expect(offDaysText([7])).toBe("Sunday");
    expect(offDaysText([])).toBe("No days");
  });
});

describe("the weekly off days", () => {
  it("are Saturday and Sunday until an admin chooses others", () => {
    expect([MON, FRI, SAT, SUN].map(isWeekend)).toEqual([false, false, true, true]);
  });
  it("follow the chosen days everywhere isWeekend is used", () => {
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [5, 6] }); // Friday and Saturday
    expect([MON, FRI, SAT, SUN].map(isWeekend)).toEqual([false, true, true, false]);
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [7] }); // only Sunday
    expect([FRI, SAT, SUN].map(isWeekend)).toEqual([false, false, true]);
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [] });
    expect([SAT, SUN].map(isWeekend)).toEqual([false, false]);
  });
  it("change how working days are counted", () => {
    expect(workingDays(MON, SUN)).toBe(5);
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [7] });
    expect(workingDays(MON, SUN)).toBe(6);
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [5, 6, 7] });
    expect(workingDays(MON, SUN)).toBe(4);
  });
});

describe("the daily target", () => {
  it("is 8 hours until an admin chooses another, and the reports use it", () => {
    expect(dailyTarget()).toBe(8);
    applySettings({ ...DEFAULT_SETTINGS, dailyTargetHours: 7.5 });
    expect(dailyTarget()).toBe(7.5);
    const t = buildUnderTargetTable({ people: [{ id: "a", name: "Asha" }], hoursById: new Map([["a", 30]]), workingDaysById: new Map([["a", 5]]) });
    expect(t.rows[0]).toMatchObject({ expected: 37.5, short: 7.5 }); // 5 days x 7.5 h
    expect(t.columns[2].label).toBe("Target (7.5 h a day)");
  });
  it("lets under-target follow the weekly off days too", () => {
    applySettings({ ...DEFAULT_SETTINGS, weeklyOffDays: [5, 6] });
    // 9 to 15 Nov with today at the end of the week: Fri and Sat are off, so Mon to Thu and Sun are working days.
    expect(expectedWorkingDays({ from: MON, to: SUN, today: "2026-11-20", offDays: new Set(), leaveDays: new Set() })).toBe(5);
  });
  it("leaves the hours report alone", () => {
    const t = buildHoursTable([{ userId: "a", name: "Asha", date: MON, project: "Internal", hours: 3, status: "approved" }], "employee");
    expect(t.totals).toMatchObject({ hours: 3 });
  });
});

describe("the admin lock", () => {
  const TODAY = "2026-11-12"; // a Thursday; this week opens on Monday 9 Nov
  it("does nothing when no lock is set: only the weekly lock applies", () => {
    expect(earliestEditable(TODAY)).toBe(MON);
    expect(isLocked(MON, TODAY)).toBe(false);
    expect(isLocked("2026-11-08", TODAY)).toBe(true);
  });
  it("locks days of the current week up to and including the chosen day", () => {
    applySettings({ ...DEFAULT_SETTINGS, lockedThrough: "2026-11-10" });
    expect(earliestEditable(TODAY)).toBe("2026-11-11");
    expect(isLocked("2026-11-09", TODAY)).toBe(true);
    expect(isLocked("2026-11-10", TODAY)).toBe(true); // the lock day itself is locked
    expect(isLocked("2026-11-11", TODAY)).toBe(false);
    expect(isLocked(TODAY, TODAY)).toBe(false);
  });
  it("doesn't reopen anything: an older lock inside a week that has already ended changes nothing", () => {
    applySettings({ ...DEFAULT_SETTINGS, lockedThrough: "2026-10-31" });
    expect(earliestEditable(TODAY)).toBe(MON);
    expect(isLocked("2026-11-08", TODAY)).toBe(true);
  });
  it("can lock up to today, so nothing is left to edit", () => {
    applySettings({ ...DEFAULT_SETTINGS, lockedThrough: TODAY });
    expect(isLocked(TODAY, TODAY)).toBe(true);
    expect(earliestEditable(TODAY)).toBe(addDays(TODAY, 1));
  });
  it("explains itself", () => {
    expect(LOCKED_MESSAGE).toMatch(/Sunday night/);
    expect(LOCKED_MESSAGE).toMatch(/admin can lock/);
  });
  it("is held in one shared copy that can be read back", () => {
    applySettings({ dailyTargetHours: 6, weeklyOffDays: [7], lockedThrough: "2026-11-01" });
    expect(currentSettings()).toEqual({ dailyTargetHours: 6, weeklyOffDays: [7], lockedThrough: "2026-11-01" });
  });
});

// The rules that really protect the data are in the database, so check the migration still spells them out.
describe("supabase/step32_settings.sql", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "..", "supabase/step32_settings.sql"), "utf8");
  it("lets everyone read the settings but nobody write to the table directly", () => {
    expect(sql).toMatch(/create policy "settings: read" on public\.app_settings for select to authenticated using \(true\)/);
    expect(sql).not.toMatch(/create policy "settings: (write|change|update|insert)/);
  });
  it("changes settings only through an admin-only function that writes to the audit log", () => {
    const body = sql.slice(sql.indexOf("function public.settings_update"));
    expect(body.slice(0, 600)).toContain("access_caller_ok()");
    expect(body).toContain("access_audit_write('settings_changed'");
    expect(body).toMatch(/At least one day of the week must be a working day/);
    expect(body).toMatch(/lock date can''t be in the future/);
  });
  it("makes the database follow the weekly off days and the lock, not only the app", () => {
    expect(sql).toContain("create or replace function public.is_weekly_off");
    expect(sql).toMatch(/create or replace function public\.is_day_off[\s\S]*public\.is_weekly_off\(d\)/);
    expect(sql).toMatch(/create or replace function public\.comp_off_before_insert[\s\S]*public\.is_weekly_off\(new\.work_date\)/);
    for (const policy of ["logs: insert own this week", "logs: delete own pending this week", "logs: update own pending this week"]) {
      const start = sql.indexOf(`create policy "${policy}"`);
      expect(start, policy).toBeGreaterThan(-1);
      expect(sql.slice(start, start + 900), policy).toContain("locked_through");
    }
  });
  it("still starts with Saturday and Sunday off, an 8 hour day and no lock", () => {
    expect(sql).toContain("daily_target_hours numeric(4, 2) not null default 8");
    expect(sql).toContain("default array[6, 7]::smallint[]");
    expect(sql).toMatch(/locked_through date,/);
  });
});
