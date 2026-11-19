import { describe, expect, it } from "vitest";
import {
  approvalsText,
  officeDateOf,
  pickReminderRecipients,
  renderTemplate,
  sentToday,
  timeReached,
  validateChatSettings,
  weekSummaryText,
  type Person,
} from "@/lib/reminders/core";

const person = (over: Partial<Person> & { id: string }): Person => ({ name: "Asha", email: `${over.id}@vyntics.com`, role: "employee", optedIn: true, lastSentAt: null, ...over });

describe("renderTemplate", () => {
  it("fills the words and leaves unknown ones alone", () => {
    expect(renderTemplate("Hi {name}, {hours} of {target}, {remaining} to go {other}", { name: "Asha", hours: 5.5, target: 8 })).toBe("Hi Asha, 5.5h of 8h, 2.5h to go {other}");
  });
  it("never shows a negative remainder", () => {
    expect(renderTemplate("{remaining}", { name: "A", hours: 9, target: 8 })).toBe("0h");
  });
});

describe("pickReminderRecipients", () => {
  const today = "2026-03-10";
  const base = { target: 8, today, onLeave: new Set<string>() };
  it("reminds only people under the target", () => {
    const out = pickReminderRecipients({ ...base, people: [person({ id: "a" }), person({ id: "b" })], hoursById: new Map([["b", 8]]) });
    expect(out.map((r) => r.person.id)).toEqual(["a"]);
  });
  it("skips people on leave, opted out, viewers and anyone reminded today", () => {
    const people = [
      person({ id: "leave" }),
      person({ id: "out", optedIn: false }),
      person({ id: "view", role: "viewer" }),
      person({ id: "done", lastSentAt: "2026-03-10T11:30:00Z" }),
      person({ id: "yesterday", lastSentAt: "2026-03-09T11:30:00Z" }),
    ];
    const out = pickReminderRecipients({ ...base, people, hoursById: new Map(), onLeave: new Set(["leave"]) });
    expect(out.map((r) => r.person.id)).toEqual(["yesterday"]);
  });
  it("does not skip people working from home", () => {
    // Work from home is not "leave": those people still log hours, so they still get reminded.
    expect(pickReminderRecipients({ ...base, people: [person({ id: "wfh" })], hoursById: new Map() })).toHaveLength(1);
  });
});

describe("dates and times", () => {
  it("uses the office day, not the UTC day", () => {
    expect(officeDateOf("2026-03-09T20:00:00Z")).toBe("2026-03-10"); // 01:30 IST the next morning
    expect(sentToday("2026-03-09T20:00:00Z", "2026-03-10")).toBe(true);
    expect(sentToday(null, "2026-03-10")).toBe(false);
  });
  it("compares the reminder time", () => {
    expect(timeReached("17:00", "17:00")).toBe(true);
    expect(timeReached("16:59", "17:00")).toBe(false);
  });
});

describe("messages", () => {
  it("summarises the week", () => {
    expect(weekSummaryText("Asha", 36, 40)).toContain("36h logged of 40h (90%)");
    expect(weekSummaryText("Asha", 40, 40)).toContain("Target reached");
  });
  it("lists what is waiting", () => {
    expect(approvalsText("Ravi", { requests: 2, logs: 1, compOff: 0 })).toBe("Hi Ravi, you have 2 leave or WFH requests and 1 time log waiting for your approval.");
  });
});

describe("validateChatSettings", () => {
  it("accepts a good time and message", () => {
    expect(validateChatSettings({ reminderTime: "17:00", template: "Hi {name}" })).toBeNull();
  });
  it("rejects a bad time or an empty or too long message", () => {
    expect(validateChatSettings({ reminderTime: "25:00", template: "x" })).not.toBeNull();
    expect(validateChatSettings({ reminderTime: "17:00", template: "   " })).not.toBeNull();
    expect(validateChatSettings({ reminderTime: "17:00", template: "x".repeat(501) })).not.toBeNull();
  });
});
