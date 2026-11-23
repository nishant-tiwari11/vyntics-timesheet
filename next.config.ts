import type { NextConfig } from "next";

// Security + SEO headers for the portal only. In your real next.config, ADD this entry to your
// existing headers() array (or create headers() if you have none). Don't replace existing entries.
const portalHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
    // Pages already visited are kept in the browser for a short time, so going back to one (or forward again) is instant, and
    // moving between pages draws the saved copy first. Saving or approving something clears them (the server tells the browser
    // which pages changed), so nothing shown is older than this after you change it yourself.
    staleTimes: { dynamic: 30, static: 180 },
    // Only the icons, date helpers and Radix parts that are used end up in the page's code.
    optimizePackageImports: ["lucide-react", "date-fns", "radix-ui"],
  },
  async headers() {
    return [
      {
        source: "/timesheet/:path((?!avatar/).*)",
        headers: portalHeaders,
      },
    ];
  },
};

export default nextConfig;
