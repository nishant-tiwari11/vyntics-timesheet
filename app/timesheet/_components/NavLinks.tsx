"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/timesheet/dashboard", label: "Dashboard" },
  { href: "/timesheet/leave", label: "Leave & WFH" },
  { href: "/timesheet/worklog", label: "Work log" },
  { href: "/timesheet/timesheet", label: "Timesheet" },
  { href: "/timesheet/calendar", label: "Calendar" },
];

export default function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/timesheet/admin", label: "Admin" }] : LINKS;

  return (
    <nav className="ts-nav" aria-label="Portal">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="ts-nav-link"
          aria-current={pathname.startsWith(l.href) ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
