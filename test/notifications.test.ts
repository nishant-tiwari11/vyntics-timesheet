import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { relativeTime, toneOf } from "@/lib/notifications";

const NOW = Date.parse("2026-11-18T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says how long ago, in plain words", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("just now");
    expect(relativeTime(ago(5 * MIN), NOW)).toBe("5 min ago");
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe("3 h ago");
    expect(relativeTime(ago(30 * HOUR), NOW)).toBe("Yesterday");
    expect(relativeTime(ago(3 * DAY), NOW)).toBe("3 days ago");
  });
  it("uses a date for anything older than a week, with the year only when it isn't this year", () => {
    expect(relativeTime(ago(20 * DAY), NOW)).toBe("29 Oct");
    expect(relativeTime(ago(400 * DAY), NOW)).toMatch(/2025$/);
  });
  it("never goes negative or shows nonsense", () => {
    expect(relativeTime(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe("just now"); // a clock a little ahead
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("toneOf", () => {
  it.each([
    ["Leave approved", "good"],
    ["Document verified", "good"],
    ["Payslip ready", "good"],
    ["Payslip updated", "good"],
    ["Expense claim reimbursed", "good"],
    ["Time log rejected", "bad"],
    ["Document rejected", "bad"],
    ["Comp-off rejected", "bad"],
    ["Documents missing", "warn"],
    ["Document expiring soon", "warn"],
    ["Document expired", "warn"],
    ["Please upload your documents", "warn"],
    ["Something else", "info"],
  ])("%s is %s", (title, tone) => {
    expect(toneOf(title)).toBe(tone);
  });
});

// The notifications for decisions are made by the database, so check the migration still spells out every event and
// still can't block the decision it is reporting on.
describe("supabase/step30_notifications.sql", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "..", "supabase/step30_notifications.sql"), "utf8");
  it("has a trigger for each kind of decision", () => {
    for (const t of ["requests", "work_logs", "comp_off_requests", "expense_claims", "payslips"]) {
      expect(sql).toMatch(new RegExp(`create trigger notify_\\w+ after (update of status|insert) on public\\.${t}\\b`));
    }
  });
  it("never lets a notification problem stop the decision", () => {
    expect(sql.match(/exception when others then null;/g)!.length).toBe(5);
  });
  it("runs as the owner so it can write notifications, and only mentions people the decision is about", () => {
    expect(sql.match(/security definer set search_path = public/g)!.length).toBe(5);
    expect(sql.match(/perform public\.notify\(new\.user_id,/g)!.length).toBe(5);
  });
});
