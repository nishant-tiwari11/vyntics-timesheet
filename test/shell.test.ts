import { describe, expect, it } from "vitest";
import { currentHref, portalLinks } from "@/app/timesheet/_components/NavLinks";

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
  it("gives an admin the management menu, with none of the employee-facing pages", () => {
    const admin = labels("admin");
    expect(admin).toEqual(["Overview", "Employees", "Documents", "Approvals", "Work logs", "Projects", "Calendar", "Holidays & leave", "Expenses", "Payroll", "Reports", "Audit log", "Settings"]);
    for (const own of ["Dashboard", "My Salary", "Leave & WFH"]) expect(admin).not.toContain(own);
  });
  it("gives every link a portal address", () => {
    for (const role of ["employee", "manager", "admin"]) for (const l of portalLinks(role)) expect(l.href).toMatch(/^\/timesheet\/[a-z/]+(\?tab=[a-z]+)?$/);
  });
});

describe("which admin menu item is open", () => {
  const links = [
    { href: "/timesheet/admin", label: "Overview", icon: "admin" as const, exact: true },
    { href: "/timesheet/admin?tab=requests", label: "Approvals", icon: "leave" as const, tabs: ["requests", "logs"] },
    { href: "/timesheet/payroll/expenses", label: "Expenses", icon: "expenses" as const },
    { href: "/timesheet/payroll", label: "Payroll", icon: "payroll" as const },
  ];
  it("picks the most specific address", () => {
    expect(currentHref(links, "/timesheet/payroll/expenses", null)).toBe("/timesheet/payroll/expenses");
    expect(currentHref(links, "/timesheet/payroll/history", null)).toBe("/timesheet/payroll");
  });
  it("tells the overview from the approvals tab", () => {
    expect(currentHref(links, "/timesheet/admin", null)).toBe("/timesheet/admin");
    expect(currentHref(links, "/timesheet/admin", "logs")).toBe("/timesheet/admin?tab=requests");
  });
});
