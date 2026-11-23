"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense } from "react";
import { useNavCounts } from "./NavCounts";

export const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  leave: (
    <>
      <path d="M4 7h16v13H4z" />
      <path d="M8 3v4M16 3v4M4 11h16" />
    </>
  ),
  worklog: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 18h3M14 14h2" />
    </>
  ),
  calendar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  expenses: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  salary: (
    <>
      <path d="M4 7h16v11H4z" />
      <path d="M4 11h16M8 15h3" />
    </>
  ),
  payroll: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.8.8 3 2.6 3 5.6" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  documents: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 15l2 2 4-4" />
    </>
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  holidays: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-5M12 16V7M16 16v-8" />
    </>
  ),
  audit: (
    <>
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
      <path d="M9.5 9h5M9.5 12.5h5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
} as const;

type IconName = keyof typeof ICONS;

export type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  /** A heading the item sits under in the admin sidebar. */
  group?: string;
  /** Only the exact address counts (a prefix would also light up every page below it). */
  exact?: boolean;
  /** For a link to a `?tab=` view of one page: the tab values that belong to it. */
  tabs?: string[];
};

const LINKS: NavLink[] = [
  { href: "/timesheet/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/timesheet/leave", label: "Leave & WFH", icon: "leave" },
  { href: "/timesheet/worklog", label: "Work log", icon: "worklog" },
  { href: "/timesheet/calendar", label: "Calendar", icon: "calendar" },
  { href: "/timesheet/expenses", label: "Expenses", icon: "expenses" },
  { href: "/timesheet/salary", label: "My Salary", icon: "salary" },
];
const TEAM_LINK: NavLink = { href: "/timesheet/team", label: "Team", icon: "team" };

// An admin is the owner / HR / manager, not an employee: no own timesheet, leave, expenses or salary here. They see the
// company: people, everyone's work logs, requests to approve, expense claims and payroll.
const ADMIN_MENU: NavLink[] = [
  { href: "/timesheet/admin", label: "Overview", icon: "dashboard", exact: true },
  { href: "/timesheet/admin/access", label: "Employees", icon: "team", group: "People" },
  { href: "/timesheet/admin/documents", label: "Documents", icon: "documents", group: "People" },
  { href: "/timesheet/admin/approvals", label: "Approvals", icon: "approvals", group: "People" },
  { href: "/timesheet/worklog", label: "Work logs", icon: "worklog", group: "Work" },
  { href: "/timesheet/admin/projects", label: "Projects", icon: "projects", group: "Work" },
  { href: "/timesheet/calendar", label: "Calendar", icon: "calendar", group: "Work" },
  { href: "/timesheet/admin?tab=holidays", label: "Holidays & leave", icon: "holidays", tabs: ["holidays"], group: "Work" },
  { href: "/timesheet/payroll/expenses", label: "Expenses", icon: "expenses", group: "Money" },
  { href: "/timesheet/payroll", label: "Payroll", icon: "payroll", group: "Money" },
  { href: "/timesheet/admin/reports", label: "Reports", icon: "reports", group: "Company" },
  { href: "/timesheet/admin/audit", label: "Audit log", icon: "audit", group: "Company" },
  { href: "/timesheet/admin/settings", label: "Settings", icon: "settings", group: "Company" },
];

export function titleFor(pathname: string): string {
  if (pathname.startsWith("/timesheet/leave")) return "Leave & WFH";
  if (pathname.startsWith("/timesheet/worklog")) return "Work log";
  if (pathname.startsWith("/timesheet/salary")) return "My Salary";
  if (pathname.startsWith("/timesheet/payroll/expenses")) return "Expenses";
  if (pathname.startsWith("/timesheet/expenses")) return "Expenses";
  if (pathname.startsWith("/timesheet/team")) return "Team";
  if (pathname.startsWith("/timesheet/payroll")) return "Payroll";
  if (pathname.startsWith("/timesheet/calendar")) return "Calendar";
  if (pathname.startsWith("/timesheet/admin/access")) return "Employees";
  if (pathname.startsWith("/timesheet/admin/documents")) return "Documents";
  if (pathname.startsWith("/timesheet/admin/projects")) return "Projects";
  if (pathname.startsWith("/timesheet/admin/audit")) return "Audit log";
  if (pathname.startsWith("/timesheet/admin/reports")) return "Reports";
  if (pathname.startsWith("/timesheet/admin/settings")) return "Settings";
  if (pathname === "/timesheet/admin" || pathname === "/timesheet/admin/") return "Admin overview";
  if (pathname.startsWith("/timesheet/admin")) return "Admin";
  if (pathname.startsWith("/timesheet/profile")) return "Profile";
  return "Dashboard";
}

export function PageTitle() {
  return <span className="ts-topbar-title">{titleFor(usePathname())}</span>;
}

export function menuFor(role: string): NavLink[] {
  return role === "admin" ? ADMIN_MENU : role === "manager" ? [...LINKS, TEAM_LINK] : LINKS;
}

/** The menu items this role can see, in order. The command palette uses the same list. */
export function portalLinks(role: string): { href: string; label: string }[] {
  return menuFor(role).map(({ href, label }) => ({ href, label }));
}

/** Which link is open: the one with the longest matching address ("Expenses" beats "Payroll" on /payroll/expenses). */
export function currentHref(links: NavLink[], pathname: string, tab: string | null): string | null {
  let best: { href: string; score: number } | null = null;
  for (const l of links) {
    const path = l.href.split("?")[0];
    let score = -1;
    if (l.tabs) {
      if (pathname === path && tab !== null && l.tabs.includes(tab)) score = path.length + 1000;
    } else if (l.exact) {
      // The overview is open on its own address, unless a tab that belongs to another link is chosen.
      const taken = tab !== null && links.some((o) => o.tabs?.includes(tab));
      if (pathname === path && !taken) score = path.length;
    } else if (pathname === path || pathname.startsWith(`${path}/`)) score = path.length;
    if (score >= 0 && (!best || score > best.score)) best = { href: l.href, score };
  }
  return best?.href ?? null;
}

// The menu: an icon and a label for each page. What is waiting for you shows as a number (and, when the menu is collapsed to
// icons, as a dot with the number in its label). The page you are on has a bar down its left edge and a filled background, so
// it isn't shown by colour alone.
export default function NavLinks({ isAdmin, isManager = false, onNavigate }: { isAdmin: boolean; isManager?: boolean; onNavigate?: () => void }) {
  // useSearchParams needs a Suspense boundary; until it is ready the menu is drawn without a ?tab= selection.
  return (
    <Suspense fallback={<NavList isAdmin={isAdmin} isManager={isManager} tab={null} onNavigate={onNavigate} />}>
      <NavWithTab isAdmin={isAdmin} isManager={isManager} onNavigate={onNavigate} />
    </Suspense>
  );
}

function NavWithTab(props: { isAdmin: boolean; isManager: boolean; onNavigate?: () => void }) {
  return <NavList {...props} tab={useSearchParams().get("tab")} />;
}

function NavList({ isAdmin, isManager, tab, onNavigate }: { isAdmin: boolean; isManager: boolean; tab: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useNavCounts();
  const links = menuFor(isAdmin ? "admin" : isManager ? "manager" : "employee");
  const open = currentHref(links, pathname, tab);

  return (
    <nav className="ts-nav" aria-label="Portal">
      {links.map((l, i) => {
        const n = counts[l.href] ?? 0;
        const heading = l.group && l.group !== links[i - 1]?.group ? <span className="ts-nav-group">{l.group}</span> : null;
        return (
          <Fragment key={l.href}>
          {heading}
          <Link key={l.href} href={l.href} onClick={onNavigate} className="ts-nav-link" aria-current={open === l.href ? "page" : undefined} title={l.label}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ts-nav-icon">
              {ICONS[l.icon]}
            </svg>
            <span className="ts-nav-label">{l.label}</span>
            {n > 0 && (
              <span className="ts-nav-badge">
                <span aria-hidden="true">{n > 99 ? "99+" : n}</span>
                <span className="ts-sr-only">{`, ${n} waiting`}</span>
              </span>
            )}
          </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
