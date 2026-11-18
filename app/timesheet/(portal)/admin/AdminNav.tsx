"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ADMIN_NAV, activeAdminNav } from "@/lib/admin/nav";

// The menu at the top of every Admin page. Sections that aren't built yet show "Soon" and can't be opened.
// It scrolls sideways on a phone instead of wrapping.
export default function AdminNav() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const active = activeAdminNav(pathname, tab);

  return (
    <nav aria-label="Admin sections" className="ts-admin-tabs">
      {ADMIN_NAV.map((item) =>
        item.href ? (
          <Link key={item.id} href={item.href} className="ts-admin-tab" aria-current={active === item.id ? "page" : undefined}>
            {item.label}
          </Link>
        ) : (
          <span key={item.id} className="ts-admin-tab cursor-not-allowed opacity-55" aria-disabled="true" title="Coming soon">
            {item.label}
            <span className="rounded-full border px-1.5 text-[11px] leading-5 font-medium">Soon</span>
          </span>
        )
      )}
    </nav>
  );
}
