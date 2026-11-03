import Link from "next/link";
import { signOut } from "../actions";
import NavLinks from "./NavLinks";
import ThemeToggle from "./ThemeToggle";

export default function Shell({
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
  return (
    <div className="ts-shell">
      <header className="ts-header">
        <div className="ts-header-inner">
          <Link href="/timesheet/dashboard" className="ts-brand">
            <span className="ts-brand-mark" aria-hidden="true">V</span>
            <span>
              Vyntics <span className="ts-muted">Timesheet</span>
            </span>
          </Link>
          <div className="ts-header-right">
            <span className="ts-user" title={email}>
              {name || email}
              {role === "admin" && <span className="ts-badge">Admin</span>}
            </span>
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className="ts-btn ts-btn-ghost">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <NavLinks isAdmin={role === "admin"} />
      </header>
      <main className="ts-main">{children}</main>
    </div>
  );
}
