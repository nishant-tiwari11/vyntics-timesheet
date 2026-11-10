import Image from "next/image";
import { Search } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { getAdminCounts } from "@/lib/timesheet/admin";
import { signOut } from "../actions";
import logo from "../login/vyntics-logo.png";
import NavLinks, { PageTitle } from "./NavLinks";

export default async function Shell({
  email,
  name,
  role,
  children,
}: {
  email: string;
  name?: string | null;
  role: "employee" | "admin";
  children: React.ReactNode;
}) {
  const shown = name || email;

  // The bell is for admins: how many requests and time logs wait for a decision. Never blocks the page.
  let waiting = 0;
  if (role === "admin") {
    try {
      const counts = await getAdminCounts();
      waiting = counts.requests + counts.logs + counts.compOff;
    } catch {
      waiting = 0;
    }
  }
  const bellHref = "/timesheet/admin?tab=requests";
  return (
    <div className="ts-shell">
      <aside className="ts-side">
        <Link href="/timesheet/dashboard" className="ts-brand">
          <Image src={logo} alt="" width={32} height={32} priority className="ts-brand-logo" />
          <span>
            Vyntics <span className="ts-muted">Timesheet</span>
          </span>
        </Link>

        <NavLinks isAdmin={role === "admin"} />

        <div className="ts-side-user">
          <span className="ts-avatar" aria-hidden="true">
            {shown.charAt(0).toUpperCase()}
          </span>
          <span className="ts-side-who" title={email}>
            <span className="ts-side-name">{shown}</span>
            <span className="ts-side-role">{role === "admin" ? "Admin" : "Employee"}</span>
          </span>
          <form action={signOut}>
            <button type="submit" className="ts-btn ts-btn-ghost ts-btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="ts-content">
        <header className="ts-topbar">
          <PageTitle />
          <form action="/timesheet/dashboard" method="get" role="search" className="ts-search">
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
          <div className="ts-topbar-right">
            {role === "admin" && (
              <Link
                href={bellHref}
                className="ts-btn ts-btn-ghost ts-icon-btn ts-bell"
                aria-label={waiting > 0 ? `${waiting} waiting for a decision` : "Nothing waiting for a decision"}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                  <path d="M13.7 20a2 2 0 0 1-3.4 0" />
                </svg>
                {waiting > 0 && <span className="ts-bell-count">{waiting > 99 ? "99+" : waiting}</span>}
              </Link>
            )}
          </div>
        </header>
        <main className="ts-main">{children}</main>
      </div>
    </div>
  );
}
