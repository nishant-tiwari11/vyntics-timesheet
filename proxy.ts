import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Runs before every /timesheet request: refreshes the sign-in session and sends signed-out visitors to the login page.
// (Next.js 16 calls this file convention "proxy"; it used to be "middleware". The work itself is in lib/supabase/middleware.ts.)
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/timesheet", "/timesheet/:path*"],
};
