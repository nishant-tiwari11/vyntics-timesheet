import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./timesheet.css";

const grotesk = Schibsted_Grotesk({
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
  themeColor: "#0E6B66",
};

// Runs before paint so there's no light/dark flash. Scoped to the portal wrapper only.
const themeInit = `(function(){try{var t=localStorage.getItem('ts-theme');var el=document.getElementById('ts-root');if(t&&el)el.setAttribute('data-theme',t);}catch(e){}})();`;

export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="ts-root" className={`ts-portal ${grotesk.variable}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      {children}
    </div>
  );
}
