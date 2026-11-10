"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// The portal is light only: the theme is forced to light, so an old saved dark choice or the device's dark mode is ignored.
// Pop-ups (dialogs, menus, sheets) render outside the portal wrapper, so the font is also set on <html>.
export function ThemeProvider({ children, fontFamily }: { children: React.ReactNode; fontFamily?: string }) {
  useEffect(() => {
    if (fontFamily) document.documentElement.style.setProperty("--ts-font", fontFamily);
  }, [fontFamily]);

  return (
    <NextThemesProvider attribute="class" forcedTheme="light" enableSystem={false} storageKey="ts-theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
