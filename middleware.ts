import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// On Next.js 16 this convention is deprecated in favour of proxy.ts (same code,
// function renamed to `proxy`). It still works; Next prints a one-line notice.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/timesheet", "/timesheet/:path*"],
};
