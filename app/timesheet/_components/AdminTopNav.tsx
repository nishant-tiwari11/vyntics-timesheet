"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PanelLeftOpen } from "lucide-react";
import { LiquidNavbar, type LiquidNavItem, type NimbusFx } from "@/components/ui/liquid-glass-navbar";
import logo from "../login/vyntics-logo.png";
import { ICONS, currentHref, menuFor, type NavLink } from "./NavLinks";
import { setAdminTopNav } from "./topNavState";

const FX: Record<string, NimbusFx> = {
  admin: "glow",
  team: "wave",
  worklog: "pop",
  leave: "spin",
  calendar: "spin",
  expenses: "drop",
  payroll: "plane",
  events: "pop",
  salary: "pop",
  dashboard: "glow",
  projects: "pop",
  documents: "pop",
  approvals: "spin",
  holidays: "spin",
  reports: "drop",
  audit: "wave",
  settings: "wave",
};

const icon = (l: NavLink) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[l.icon]}
  </svg>
);

const LINKS = menuFor("admin");
const ITEMS: LiquidNavItem[] = LINKS.map((l) => ({ label: l.label, icon: icon(l), fx: FX[l.icon] ?? "pop" }));
// Icons only, so the floating pill stays small; each one has its name as a tooltip and for screen readers.

function Pill() {
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const open = currentHref(LINKS, pathname, tab);
  const index = Math.max(0, LINKS.findIndex((l) => l.href === open));
  return <LiquidNavbar tone="light" compact items={ITEMS} active={index} onChange={(i) => router.push(LINKS[i].href)} />;
}

// The admin's menu as a floating pill at the top of the page, shown instead of the sidebar once the sidebar is folded away.
// Hidden on phones (the drawer is used there).
export function AdminTopNav() {
  return (
    <div className="ts-topnav">
      <Link href="/timesheet/admin" className="ts-topnav-chip ts-topnav-brand" aria-label="Vyntics admin overview" title="Admin overview">
        <Image src={logo} alt="" width={28} height={28} />
      </Link>
      <Suspense fallback={<div className="h-[54px]" aria-hidden="true" />}>
        <Pill />
      </Suspense>
      <button type="button" className="ts-topnav-chip" onClick={() => setAdminTopNav(false)} title="Show the sidebar" aria-label="Show the sidebar">
        <PanelLeftOpen className="size-4" aria-hidden="true" />
        <span className="ts-topnav-show">Sidebar</span>
      </button>
    </div>
  );
}
