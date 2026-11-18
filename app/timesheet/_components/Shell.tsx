import Image from "next/image";
import { Search } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, type Role } from "@/lib/access/config";
import { signOut } from "../actions";
import logo from "../login/vyntics-logo.png";
import NavLinks, { PageTitle } from "./NavLinks";
import { CompleteProfilePrompt } from "./CompleteProfilePrompt";
import { NotificationsBell } from "./NotificationsBell";
import { UserAvatar } from "./UserAvatar";
import { UserMenu } from "./UserMenu";

export default function Shell({
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

  return (
    <div className="ts-shell">
      <aside className="ts-side">
        <Link href="/timesheet/dashboard" className="ts-brand">
          <Image src={logo} alt="" width={32} height={32} priority className="ts-brand-logo" />
          <span>
            Vyntics <span className="ts-muted">Timesheet</span>
          </span>
        </Link>

        <NavLinks isAdmin={role === "admin"} isManager={role === "manager"} />

        <div className="ts-side-user">
          <Link href="/timesheet/profile" className="ts-side-avatar" aria-label="Your profile">
            <UserAvatar userId={id} name={shown} className="size-10 text-base" />
          </Link>
          <span className="ts-side-who" title={email}>
            <span className="ts-side-name">{shown}</span>
            <span className="ts-side-role">{ROLE_LABEL[role]}</span>
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
  );
}
