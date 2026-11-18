import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Entry } from "@/app/timesheet/(portal)/worklog/model";
import { buildRows } from "@/app/timesheet/(portal)/worklog/timesheet/gridModel";
import { parseQuickAdd } from "@/app/timesheet/(portal)/worklog/timesheet/quickAdd";

const TODAY = "2026-11-17"; // a Tuesday

const entry = (over: Partial<Entry>): Entry => ({
  id: "e1",
  userId: "me",
  person: "Me",
  date: TODAY,
  start: "09:00",
  end: "11:00",
  hours: 2,
  project: "Client work",
  text: "Did things",
  status: "pending",
  noCompOff: false,
  reviewedAt: null,
  ...over,
});

describe("the grid with a project list from the database", () => {
  const projects = ["Research", "Client work"];

  it("shows projects in the list's order, and only the ones with hours or added by hand", () => {
    const rows = buildRows({ entries: [entry({ project: "Client work" })], myId: "me", days: [TODAY], today: TODAY, projects, extra: ["Research"] });
    expect(rows.map((r) => r.project)).toEqual(["Research", "Client work"]);
    expect(rows[1].cells[0].state).toBe("editable");
  });

  it("keeps an archived project's hours on screen, locked, so nothing ever goes missing from the totals", () => {
    const rows = buildRows({ entries: [entry({ project: "Old project", hours: 3, end: "12:00" })], myId: "me", days: [TODAY], today: TODAY, projects });
    expect(rows.map((r) => r.project)).toEqual(["Old project"]);
    expect(rows[0].cells[0].minutes).toBe(180);
    expect(rows[0].cells[0].state).toBe("locked");
    expect(rows[0].cells[0].reason).toMatch(/archived/);
  });

  it("puts archived projects after the current ones, A to Z, then entries with no project", () => {
    const rows = buildRows({
      entries: [entry({ id: "1", project: "Zeta" }), entry({ id: "2", project: "Alpha" }), entry({ id: "3", project: "" }), entry({ id: "4", project: "Client work" })],
      myId: "me",
      days: [TODAY],
      today: TODAY,
      projects,
    });
    expect(rows.map((r) => r.project)).toEqual(["Client work", "Alpha", "Zeta", ""]);
  });

  it("still works with the built-in names when no list is given", () => {
    const rows = buildRows({ entries: [entry({ project: "Internal" })], myId: "me", days: [TODAY], today: TODAY });
    expect(rows[0].cells[0].state).toBe("editable");
  });
});

describe("quick add with a project list from the database", () => {
  it("recognises a project by name from the list it is given", () => {
    expect(parseQuickAdd("2 hours on research", "2026-11-18", ["Research", "Client work"]).project).toBe("Research");
    expect(parseQuickAdd("2 hours on training", "2026-11-18", ["Research", "Client work"]).project).toBeNull(); // not in this list
  });
  it("still knows the built-in names without a list", () => {
    expect(parseQuickAdd("45 min meetings", "2026-11-18").project).toBe("Meetings");
  });
});

// The rules that keep the list sane live in the database, so check the migration still spells them out.
describe("supabase/step31_projects.sql", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "..", "supabase/step31_projects.sql"), "utf8");
  it("lets everyone read the list but nobody write to it directly", () => {
    expect(sql).toMatch(/create policy "projects: read" on public\.projects for select to authenticated using \(true\)/);
    expect(sql).not.toMatch(/create policy "projects: (add|change|write|insert|update|delete)/);
  });
  it("makes every change through an admin-only function that writes to the audit log", () => {
    for (const fn of ["project_add", "project_rename", "project_set_active"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}`));
      expect(body.slice(0, 1200)).toContain("access_caller_ok()");
    }
    expect(sql.match(/perform public\.access_audit_write\(/g)!.length).toBe(3); // add, rename, archive or restore
  });
  it("never deletes, keeps names unique, and protects used and last projects", () => {
    expect(sql).not.toMatch(/delete from public\.projects/);
    expect(sql).toMatch(/create unique index if not exists projects_name_key on public\.projects \(lower\(btrim\(name\)\)\)/);
    expect(sql).toMatch(/can''t be renamed/); // a used project can't be renamed
    expect(sql).toMatch(/At least one project must stay active/);
  });
  it("starts with the five projects that existed before", () => {
    for (const name of ["Client work", "Internal", "Meetings", "Training", "Leave"]) expect(sql).toContain(`('${name}')`);
  });
});
