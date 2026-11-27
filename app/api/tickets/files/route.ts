import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addAttachment, attachmentUrl } from "@/lib/tickets/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Files on tickets.
//   GET  ?id=<file>            opens the file (a one-minute link, made only after the database says you may read it)
//   POST form: ticketId, file, screenshot=1?   attaches one file to a ticket you raised or handle
// Files are larger than a server action accepts, so this is a route handler. The POST also checks the Origin header, so another
// site can't make your browser attach files.
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return new NextResponse("Please sign in.", { status: 401, headers: HEADERS });
  try {
    const found = await attachmentUrl(req.nextUrl.searchParams.get("id") ?? "");
    if (!found) return new NextResponse("File not found.", { status: 404, headers: HEADERS });
    return NextResponse.redirect(found.url, { status: 302, headers: HEADERS });
  } catch (e) {
    if (e instanceof TimesheetError) return new NextResponse(e.message, { status: 400, headers: HEADERS });
    logError("ticket file open", e);
    return new NextResponse("Something went wrong.", { status: 500, headers: HEADERS });
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) return json({ ok: false, error: "That request was not allowed." }, 403);
  if (!(await getCurrentUser())) return json({ ok: false, error: "Your session has expired. Please sign in again." }, 401);
  try {
    const form = await req.formData();
    const file = form.get("file");
    const ticketId = form.get("ticketId");
    if (typeof ticketId !== "string" || !(file instanceof File)) return json({ ok: false, error: "Choose a file first." }, 400);
    await addAttachment(ticketId, file, form.get("screenshot") === "1");
    revalidatePath("/timesheet/tickets", "layout");
    return json({ ok: true });
  } catch (e) {
    if (e instanceof TimesheetError) return json({ ok: false, error: e.message }, 400);
    logError("ticket file upload", e);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}
