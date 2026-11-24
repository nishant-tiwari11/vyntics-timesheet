import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { acceptTyped, acceptUpload } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// POST /api/offers/<id>/accept
//   multipart: method=typed, name, date          accept by typing your name and today's date
//   multipart: method=upload, file               accept by uploading a signed copy
// Only the person the letter was sent to can accept it (the database checks that again). The Origin header is checked so another
// site can't make your browser accept for you.
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) return json({ ok: false, error: "Request refused." }, 403);
  if (!(await getCurrentUser())) return json({ ok: false, error: "Please sign in again." }, 401);
  try {
    const { id } = await ctx.params;
    const form = await req.formData();
    const method = String(form.get("method") ?? "");
    if (method === "typed") {
      if (form.get("confirm") !== "yes") throw new TimesheetError("Tick the box to confirm you accept the offer.");
      await acceptTyped(id, String(form.get("name") ?? ""), String(form.get("date") ?? ""));
    } else if (method === "upload") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new TimesheetError("Choose the signed copy first.");
      await acceptUpload(id, file);
    } else {
      throw new TimesheetError("Choose how you are accepting.");
    }
    for (const p of ["/timesheet/profile", "/timesheet/admin/audit", "/timesheet/admin/documents"]) revalidatePath(p);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof TimesheetError) return json({ ok: false, error: e.message }, 400);
    logError("offer accept", e);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}
