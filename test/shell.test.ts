import { describe, expect, it } from "vitest";
import { portalLinks } from "@/app/timesheet/_components/NavLinks";

const labels = (role: string) => portalLinks(role).map((l) => l.label);

describe("the menu a role sees (the sidebar, the drawer and the command palette share it)", () => {
  it("shows employees the everyday pages only", () => {
    expect(labels("employee")).toEqual(["Dashboard", "Leave & WFH", "Work log", "Calendar", "Expenses", "My Salary"]);
    expect(labels("viewer")).toEqual(labels("employee"));
  });
  it("adds Team for a manager, but not Payroll or Admin", () => {
    expect(labels("manager")).toContain("Team");
    expect(labels("manager")).not.toContain("Admin");
    expect(labels("manager")).not.toContain("Payroll");
  });
  it("gives an admin Team, Payroll and Admin after the everyday pages", () => {
    const admin = labels("admin");
    expect(admin.slice(-3)).toEqual(["Team", "Payroll", "Admin"]);
    expect(admin).toEqual(expect.arrayContaining(labels("employee")));
  });
  it("gives every link a portal address", () => {
    for (const role of ["employee", "manager", "admin"]) for (const l of portalLinks(role)) expect(l.href).toMatch(/^\/timesheet\/[a-z]+$/);
  });
});
