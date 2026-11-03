// SCAFFOLD ONLY - stands in for your existing sitemap. Do NOT replace your real one:
// keep it as is and add the `.filter(...)` below to whatever list it returns.
import type { MetadataRoute } from "next";

const SITE = "https://vyntics-website.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = [{ url: `${SITE}/`, lastModified: new Date() }];

  // The portal must never be listed, even if a route list is generated automatically.
  return pages.filter((page) => !new URL(page.url).pathname.startsWith("/timesheet"));
}
