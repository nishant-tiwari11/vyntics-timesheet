// The Admin section's sub-navigation. Plain code with no server-only imports, so the menu, the pages and the tests share it.

export type AdminNavItem = {
  id: string;
  label: string;
  /** Where it goes. Missing means the section isn't built yet: it shows as "Soon" and can't be opened. */
  href?: string;
  /** The `?tab=` values of /timesheet/admin that belong to this item. */
  tabs?: string[];
  /** Pages under this path belong to this item. */
  path?: string;
};

const ADMIN = "/timesheet/admin";

export const ADMIN_NAV: AdminNavItem[] = [
  { id: "overview", label: "Overview", href: ADMIN },
  { id: "users", label: "Users & Roles", href: `${ADMIN}/access`, path: `${ADMIN}/access`, tabs: ["employees"] },
  { id: "projects", label: "Projects" },
  { id: "holidays", label: "Holidays & Leave Policy", href: `${ADMIN}?tab=holidays`, tabs: ["holidays"] },
  { id: "approvals", label: "Approvals", href: `${ADMIN}?tab=requests`, tabs: ["requests", "logs", "compoff"] },
  { id: "payroll", label: "Payroll & Expenses", href: "/timesheet/payroll", path: "/timesheet/payroll" },
  { id: "documents", label: "Documents", href: `${ADMIN}/documents`, path: `${ADMIN}/documents` },
  { id: "reports", label: "Reports", href: `${ADMIN}/reports`, path: `${ADMIN}/reports` },
  { id: "audit", label: "Audit Log", href: `${ADMIN}/audit`, path: `${ADMIN}/audit` },
  { id: "settings", label: "Settings" },
];

/** Which menu item is open, from the address. `tab` is the ?tab= value of /timesheet/admin. */
export function activeAdminNav(pathname: string, tab: string | null): string | null {
  const path = pathname.replace(/\/$/, "");
  for (const item of ADMIN_NAV) {
    if (item.path && (path === item.path || path.startsWith(`${item.path}/`))) return item.id;
  }
  if (path === ADMIN) {
    if (!tab) return "overview";
    return ADMIN_NAV.find((i) => i.tabs?.includes(tab))?.id ?? null;
  }
  return null;
}
