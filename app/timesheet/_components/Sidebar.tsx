"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { signOut } from "../actions";
import logo from "../login/vyntics-logo.png";
import NavLinks from "./NavLinks";
import { UserAvatar } from "./UserAvatar";
import { clearLocalCache } from "@/lib/client/localCache";

export type SideUser = { id: string; name: string; email: string; roleLabel: string; isAdmin: boolean; isManager: boolean };

/** The brand, the menu and who you are. Used by the desktop sidebar and by the drawer on a phone. */
export function SideBody({ user, collapsed = false, onNavigate }: { user: SideUser; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <>
      <Link href={user.isAdmin ? "/timesheet/admin" : "/timesheet/dashboard"} className="ts-brand" onClick={onNavigate} title="Vyntics Workspace">
        <Image src={logo} alt="" width={32} height={32} priority className="ts-brand-logo" />
        <span className="ts-brand-text">
          Vyntics <span className="ts-muted">Workspace</span>
        </span>
      </Link>

      <NavLinks isAdmin={user.isAdmin} isManager={user.isManager} onNavigate={onNavigate} />

      <div className="ts-side-user">
        <Link href="/timesheet/profile" className="ts-side-avatar" aria-label="Your profile" onClick={onNavigate} title={`${user.name}, your profile`}>
          <UserAvatar userId={user.id} name={user.name} className="size-10 text-base" />
        </Link>
        {!collapsed && (
          <Link href="/timesheet/profile" className="ts-side-who rounded-md hover:underline focus-visible:outline-2" title={`${user.email}, open your profile`} onClick={onNavigate}>
            <span className="ts-side-name">{user.name}</span>
            <span className="ts-side-role">{user.roleLabel}</span>
          </Link>
        )}
        <form action={signOut} onSubmit={clearLocalCache} className="ts-side-signout">
          <button type="submit" className="ts-btn ts-btn-ghost ts-btn-sm" title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="ts-side-signout-text">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}

const COOKIE = "ts-side";

// The desktop sidebar. A button at the bottom folds it down to icons (and back); the choice is kept in a cookie, so the page
// is drawn the right way round from the start with no flicker. On a phone it is replaced by a drawer (MobileNav).
export function Sidebar({ user, initialCollapsed }: { user: SideUser; initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <aside className="ts-side" data-collapsed={collapsed} aria-label="Sidebar">
      <button
        type="button"
        className="ts-side-toggle"
        onClick={toggle}
        aria-pressed={collapsed}
        aria-label={collapsed ? "Expand the menu" : "Collapse the menu to icons"}
        title={collapsed ? "Expand the menu" : "Collapse the menu"}
      >
        {collapsed ? <ChevronsRight className="size-4" aria-hidden="true" /> : <ChevronsLeft className="size-4" aria-hidden="true" />}
      </button>
      <SideBody user={user} collapsed={collapsed} />
    </aside>
  );
}
