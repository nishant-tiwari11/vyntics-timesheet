"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SideBody, type SideUser } from "./Sidebar";

// On a phone or small tablet the sidebar is a drawer that slides in from the left. The menu button is in the top bar; choosing
// a page closes the drawer.
export function MobileNav({ user }: { user: SideUser }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="ts-btn ts-btn-ghost ts-icon-btn ts-menu-btn" aria-label="Open the menu">
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="ts-drawer w-[280px] max-w-[85vw] gap-0 p-0">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Pages in the portal</SheetDescription>
        {/* The pop-up is drawn outside the page's own wrapper, so it needs the portal class to get the portal's colours. */}
        <div className="ts-portal ts-drawer-body">
          <SideBody user={user} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
