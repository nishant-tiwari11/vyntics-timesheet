import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "./timesheet.css";
import "./_components/fields.css";
import "./_components/polish.css";

const font = Geist({
  subsets: ["latin"],
  variable: "--ts-font",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Timesheet · Vyntics", template: "%s · Vyntics Timesheet" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="ts-root" className={`ts-portal ${font.variable}`}>
      <ThemeProvider fontFamily={font.style.fontFamily}>
        {children}
        <Toaster />
      </ThemeProvider>
    </div>
  );
}
