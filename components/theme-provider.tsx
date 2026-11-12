"use client";

import { useEffect } from "react";

// The portal is light only, so there is no theme switching any more (and no theme library).
// Pop-ups (dialogs, menus, sheets) render outside the portal wrapper, so the font is also set on <html>.
export function ThemeProvider({ children, fontFamily }: { children: React.ReactNode; fontFamily?: string }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark"); // an old saved dark choice must not apply
    if (fontFamily) document.documentElement.style.setProperty("--ts-font", fontFamily);
  }, [fontFamily]);

  return <>{children}</>;
}
