"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { href: "/timesheet/salary", label: "My Salary", icon: "salary" },
];
const ADMIN_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/timesheet/payroll", label: "Payroll", icon: "payroll" },
  { href: "/timesheet/admin", label: "Admin", icon: "admin" },
];

export function titleFor(pathname: string): string {
  if (pathname.startsWith("/timesheet/leave")) return "Leave & WFH";
  if (pathname.startsWith("/timesheet/worklog")) return "Work log";
  if (pathname.startsWith("/timesheet/salary")) return "My Salary";
  if (pathname.startsWith("/timesheet/payroll")) return "Payroll";
  if (pathname.startsWith("/timesheet/events")) return "Events";
  if (pathname.startsWith("/timesheet/calendar")) return "Calendar";
  if (pathname.startsWith("/timesheet/admin")) return "Admin";
  return "Dashboard";
}

export function PageTitle() {
  return <span className="ts-topbar-title">{titleFor(usePathname())}</span>;
}

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="ts-nav" aria-label="Portal">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="ts-nav-link" aria-current={current(l.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[l.icon]}
          </svg>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
