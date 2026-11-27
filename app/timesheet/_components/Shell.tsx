import { cookies } from "next/headers";
import { worksInPortal, ROLE_LABEL, type Role } from "@/lib/access/config";
import { DutyControl } from "./DutyControl";
import { CommandPalette } from "./CommandPalette";
import { MobileNav } from "./MobileNav";
import { Suspense } from "react";
import { NavCountsProvider } from "./NavCounts";
import NavProgress from "./NavProgress";
import { PrefetchWarmer } from "./PrefetchWarmer";
import { PageTitle } from "./NavLinks";
import { NotificationsBell } from "./NotificationsBell";
import { Sidebar, type SideUser } from "./Sidebar";

export default async function Shell({
  id,
  email,
  name,
  role,
  rejectedDocs = 0,
  children,
}: {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  /** Documents HR sent back to this person. */
  rejectedDocs?: number;
  children: React.ReactNode;
}) {
  const shown = name || email;
  // Whether the sidebar was folded down to icons last time (a cookie, so the page is drawn that way from the start).
  const collapsed = (await cookies()).get("ts-side")?.value === "collapsed";
  const user: SideUser = { id, name: shown, email, roleLabel: ROLE_LABEL[role], isAdmin: role === "admin", isManager: role === "manager" };

  return (
    <NavCountsProvider userId={id}>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <PrefetchWarmer role={role} />
      <div className="ts-shell">
        <Sidebar user={user} initialCollapsed={collapsed} />

        <div className="ts-content">
          <header className="ts-topbar">
            <MobileNav user={user} />
            <PageTitle />
            {worksInPortal(role) && <DutyControl />}
            <CommandPalette role={role} />
            {/* Keeps the top bar's spacing: the notification bell stays on the right (your profile and sign out are at the bottom of the side menu). */}
            <span className="ts-search" aria-hidden="true" />
            <div className="ts-topbar-right">
              <NotificationsBell />
            </div>
          </header>
          {rejectedDocs > 0 && (
            <p role="alert" className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              HR sent back {rejectedDocs} {rejectedDocs === 1 ? "document" : "documents"}. Please upload {rejectedDocs === 1 ? "it" : "them"} again.
              <a href="/timesheet/profile?tab=documents" className="font-medium underline underline-offset-4">
                Fix now
              </a>
            </p>
          )}
          <main className="ts-main">
            {role === "viewer" && (
              <p role="note" className="mb-4 rounded-md border border-dashed px-3 py-2 text-sm">
                You have read-only access. You can look at your data but not change it.
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </NavCountsProvider>
  );
}
