import { NextResponse, type NextRequest } from "next/server";
import { offerPdfFor } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// GET /api/offers/<id>/pdf: the letter as a PDF. Admins can fetch any letter (a draft is typeset on the spot); a person only their
// own sent or accepted one. The database decides what is readable; anything else is "not found".
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse("Please sign in.", { status: 401, headers: HEADERS });
  try {
    const { id } = await ctx.params;
    const found = await offerPdfFor(id);
    if (!found) return new NextResponse("Letter not found.", { status: 404, headers: HEADERS });
    return new NextResponse(Buffer.from(found.bytes), {
      headers: {
        ...HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${found.name.replace(/[^\w .()-]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(found.name)}`,
      },
    });
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("offer pdf", e);
    return new NextResponse(e instanceof TimesheetError ? e.message : "Something went wrong.", { status: 400, headers: HEADERS });
  }
}
