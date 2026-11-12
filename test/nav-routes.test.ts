import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { titleFor } from "../app/timesheet/_components/NavLinks";

// Every sidebar link must open its own page: the page file exists, it doesn't quietly redirect to a different page
// (that was the bug: Work log sent you to the Dashboard), and the top bar shows a title of its own.

const root = path.resolve(__dirname, "..");
const navSource = fs.readFileSync(path.join(root, "app/timesheet/_components/NavLinks.tsx"), "utf8");

// Employee links, then admin links (the lists in NavLinks.tsx).
const hrefs = [...navSource.matchAll(/href: "(\/timesheet\/[a-z-]+)"/g)].map((m) => m[1]);

const pageFile = (href: string) => path.join(root, "app/timesheet/(portal)", href.replace("/timesheet/", ""), "page.tsx");

describe("sidebar links", () => {
  it("found the links", () => {
    expect(hrefs).toEqual(expect.arrayContaining(["/timesheet/dashboard", "/timesheet/worklog", "/timesheet/leave", "/timesheet/calendar", "/timesheet/admin", "/timesheet/payroll"]));
  });

  it.each(hrefs)("%s has its own page file", (href) => {
    expect(fs.existsSync(pageFile(href))).toBe(true);
  });

  it.each(hrefs)("%s doesn't redirect to a different page", (href) => {
    const source = fs.readFileSync(pageFile(href), "utf8");
    for (const m of source.matchAll(/redirect\(\s*["'`]([^"'`]+)["'`]/g)) {
      const target = m[1];
      // Allowed: a guard sending people away (login, dashboard for non-admins), or staying inside the same section.
      const stays = target.startsWith(href);
      const guard = target === "/timesheet/login" || (target === "/timesheet/dashboard" && /role/.test(source));
      expect(stays || guard, `${href} redirects to ${target}`).toBe(true);
    }
  });

  it("every link has a different page title", () => {
    const titles = hrefs.map((h) => titleFor(h));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("Work log shows its own title, not Dashboard", () => {
    expect(titleFor("/timesheet/worklog")).toBe("Work log");
    expect(titleFor("/timesheet/dashboard")).toBe("Dashboard");
  });
});
