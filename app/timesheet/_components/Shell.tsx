import { cookies } from "next/headers";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, type Role } from "@/lib/access/config";
import { AdminTopNav } from "./AdminTopNav";
import { CommandPalette } from "./CommandPalette";
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
    <NavCountsProvider>
      <div className="ts-shell" data-topnav={role === "admin" && collapsed}>
        <Sidebar user={user} initialCollapsed={collapsed} />

        <div className="ts-content">
          {role === "admin" && <AdminTopNav />}
          <header className="ts-topbar">
            <MobileNav user={user} />
            <PageTitle />
            <CommandPalette role={role} />
            {role === "admin" ? <span className="ts-search" aria-hidden="true" /> : (
            <form action="/timesheet/dashboard#logs" method="get" role="search" className="ts-search">
              <label htmlFor="ts-search-input" className="ts-sr-only">
                Search time logs
              </label>
              <Search className="size-4" aria-hidden="true" />
              <Input
                id="ts-search-input"
                name="q"
                type="search"
                maxLength={60}
                className="h-11 border-transparent bg-muted/60 pl-9 shadow-none transition-colors placeholder:text-muted-foreground hover:bg-muted focus-visible:border-input focus-visible:bg-background md:h-9"
                placeholder="Search time logs and projects"
                autoComplete="off"
              />
              <input type="hidden" name="range" value="all" />
            </form>
            )}
            <div className="ts-topbar-right">
              <NotificationsBell />
              <UserMenu id={id} name={shown} email={email} roleLabel={ROLE_LABEL[role]} />
            </div>
          </header>
          {rejectedDocs > 0 && (
            <p role="alert" className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              HR sent back {rejectedDocs} {rejectedDocs === 1 ? "document" : "documents"}. Please upload {rejectedDocs === 1 ? "it" : "them"} again.
              <a href="/timesheet/onboarding" className="font-medium underline underline-offset-4">
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
