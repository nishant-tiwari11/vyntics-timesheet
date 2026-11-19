"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavCounts } from "./NavCounts";

const ICONS = {
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
  admin: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
} as const;

type IconName = keyof typeof ICONS;

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/timesheet/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/timesheet/leave", label: "Leave & WFH", icon: "leave" },
  { href: "/timesheet/worklog", label: "Work log", icon: "worklog" },
  { href: "/timesheet/calendar", label: "Calendar", icon: "calendar" },
  { href: "/timesheet/events", label: "Events", icon: "events" },
  { href: "/timesheet/expenses", label: "Expenses", icon: "expenses" },
  { href: "/timesheet/salary", label: "My Salary", icon: "salary" },
];
const TEAM_LINK: { href: string; label: string; icon: IconName } = { href: "/timesheet/team", label: "Team", icon: "team" };
const ADMIN_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/timesheet/payroll", label: "Payroll", icon: "payroll" },
  { href: "/timesheet/admin", label: "Admin", icon: "admin" },
];

export function titleFor(pathname: string): string {
  if (pathname.startsWith("/timesheet/leave")) return "Leave & WFH";
  if (pathname.startsWith("/timesheet/worklog")) return "Work log";
  if (pathname.startsWith("/timesheet/salary")) return "My Salary";
  if (pathname.startsWith("/timesheet/expenses")) return "Expenses";
  if (pathname.startsWith("/timesheet/team")) return "Team";
  if (pathname.startsWith("/timesheet/payroll")) return "Payroll";
  if (pathname.startsWith("/timesheet/events")) return "Events";
  if (pathname.startsWith("/timesheet/calendar")) return "Calendar";
  if (pathname.startsWith("/timesheet/admin")) return "Admin";
  if (pathname.startsWith("/timesheet/profile")) return "Profile";
  return "Dashboard";
}

export function PageTitle() {
  return <span className="ts-topbar-title">{titleFor(usePathname())}</span>;
}

/** The menu items this role can see, in order. The command palette uses the same list. */
export function portalLinks(role: string): { href: string; label: string }[] {
  const links = role === "admin" ? [...LINKS, TEAM_LINK, ...ADMIN_LINKS] : role === "manager" ? [...LINKS, TEAM_LINK] : LINKS;
  return links.map(({ href, label }) => ({ href, label }));
}

// The menu: an icon and a label for each page. What is waiting for you shows as a number (and, when the menu is collapsed to
// icons, as a dot with the number in its label). The page you are on has a bar down its left edge and a filled background, so
// it isn't shown by colour alone.
export default function NavLinks({ isAdmin, isManager = false, onNavigate }: { isAdmin: boolean; isManager?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useNavCounts();
  const links = isAdmin ? [...LINKS, TEAM_LINK, ...ADMIN_LINKS] : isManager ? [...LINKS, TEAM_LINK] : LINKS;
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="ts-nav" aria-label="Portal">
      {links.map((l) => {
        const n = counts[l.href] ?? 0;
        return (
          <Link key={l.href} href={l.href} onClick={onNavigate} className="ts-nav-link" aria-current={current(l.href) ? "page" : undefined} title={l.label}>
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
        );
      })}
    </nav>
  );
}
