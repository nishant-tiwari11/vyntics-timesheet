import { cookies } from "next/headers";
import { ROLE_LABEL, type Role } from "@/lib/access/config";
import { CommandPalette } from "./CommandPalette";
import { CompleteProfilePrompt } from "./CompleteProfilePrompt";
import { MobileNav } from "./MobileNav";
import { NavCountsProvider } from "./NavCounts";
import { PageTitle } from "./NavLinks";
import { NotificationsBell } from "./NotificationsBell";
import { Sidebar, type SideUser } from "./Sidebar";
import { UserMenu } from "./UserMenu";

export default async function Shell({
  id,
  email,
  name,
  role,
  children,
}: {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  children: React.ReactNode;
}) {
  const shown = name || email;
  // Whether the sidebar was folded down to icons last time (a cookie, so the page is drawn that way from the start).
  const collapsed = (await cookies()).get("ts-side")?.value === "collapsed";
  const user: SideUser = { id, name: shown, email, roleLabel: ROLE_LABEL[role], isAdmin: role === "admin", isManager: role === "manager" };

  return (
    <NavCountsProvider>
      <div className="ts-shell">
        <Sidebar user={user} initialCollapsed={collapsed} />

        <div className="ts-content">
          <header className="ts-topbar">
            <MobileNav user={user} />
            <PageTitle />
            <CommandPalette role={role} />
            {/* Keeps the top bar's spacing: the notification bell and your picture stay on the right. */}
            <span className="ts-search" aria-hidden="true" />
            <div className="ts-topbar-right">
              <NotificationsBell />
              <UserMenu id={id} name={shown} email={email} roleLabel={ROLE_LABEL[role]} />
            </div>
          </header>
          {role !== "viewer" && <CompleteProfilePrompt userId={id} />}
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
