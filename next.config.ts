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
  async headers() {
    return [
      {
        source: "/timesheet/:path*",
        headers: portalHeaders,
      },
    ];
  },
};

export default nextConfig;
