import { NextResponse } from "next/server";
import { readLogo } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";

// GET /api/offers/logo: the company logo drawn on offer letters (the uploaded one, else the portal's). Any signed-in person, because
// an employee's preview of their own letter shows it too.
export async function GET() {
  if (!(await getCurrentUser())) return new NextResponse("Please sign in.", { status: 401 });
  const bytes = await readLogo();
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
