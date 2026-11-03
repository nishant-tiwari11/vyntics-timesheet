// SCAFFOLD ONLY - stands in for your existing robots setup. Do NOT replace your real one:
// add `disallow: "/timesheet"` to its rules and keep every other rule and the sitemap line.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/timesheet"],
      },
    ],
    sitemap: "https://vyntics-website.vercel.app/sitemap.xml",
  };
}
