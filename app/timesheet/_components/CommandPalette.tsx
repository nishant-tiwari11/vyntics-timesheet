"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CornerDownLeft, LogOut, Search, UserRound } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { signOut } from "../actions";
import { portalLinks } from "./NavLinks";

// Press Ctrl+K (Cmd+K on a Mac), or the Search button, then type to jump to any page. Arrow keys move, Enter opens, Esc closes.
// It only navigates; nothing here changes any data (Sign out is the one action, and it asks nothing the menu doesn't).
export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const pages = portalLinks(role);
  const adminPages = role === "admin" ? ADMIN_NAV.filter((i) => i.href && i.id !== "payroll").map((i) => ({ href: i.href!, label: i.label })) : [];

  return (
    <>
      <button type="button" className="ts-palette-btn" onClick={() => setOpen(true)} aria-label="Search pages and actions" aria-keyshortcuts="Control+K Meta+K">
        <Search className="size-4" aria-hidden="true" />
        <span className="ts-palette-text">Jump to…</span>
        <kbd className="ts-palette-kbd" aria-hidden="true">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Jump to a page" description="Type to search the pages of the portal">
        <CommandInput placeholder="Type a page or an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.href} value={`page ${p.label}`} onSelect={() => go(p.href)}>
                {p.label}
                <CommandShortcut>
                  <CornerDownLeft className="size-3.5" aria-hidden="true" />
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          {adminPages.length > 0 && (
            <CommandGroup heading="Admin">
              {adminPages.map((p) => (
                <CommandItem key={p.href} value={`admin ${p.label}`} onSelect={() => go(p.href)}>
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="You">
            <CommandItem value="profile photo documents" onSelect={() => go("/timesheet/profile")}>
              <UserRound aria-hidden="true" /> Your profile and documents
            </CommandItem>
            <CommandItem
              value="sign out log out"
              onSelect={() => {
                setOpen(false);
                void signOut();
              }}
            >
              <LogOut aria-hidden="true" /> Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
