import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addBill, billSignedUrl, removeBill } from "@/lib/expenses/bills";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// Bills for expense claims.
//   GET    ?id=<bill>   opens the bill (a one-minute link, after the database says you may read it)
//   POST   form: claimId, file   attaches a bill to your own draft or pending claim
//   DELETE ?id=<bill>   removes a bill from your own draft or pending claim
// Files are larger than a server action accepts, so this is a route handler. Changes also check the Origin header, so another
// site can't make your browser add or remove bills.
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

const sameOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return !!origin && origin === req.nextUrl.origin;
};

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

function failure(e: unknown) {
  if (e instanceof TimesheetError) return json({ ok: false, error: e.message }, 400);
  logError("expense bills", e);
  return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
}

const refresh = () => {
  revalidatePath("/timesheet/expenses");
  revalidatePath("/timesheet/payroll/expenses");
};

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return new NextResponse("Please sign in.", { status: 401, headers: HEADERS });
  try {
    const found = await billSignedUrl(req.nextUrl.searchParams.get("id") ?? "");
    if (!found) return new NextResponse("Bill not found.", { status: 404, headers: HEADERS });
    return NextResponse.redirect(found.url, { status: 302, headers: HEADERS });
  } catch (e) {
    return new NextResponse(e instanceof TimesheetError ? e.message : "Something went wrong.", { status: 400, headers: HEADERS });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Request refused." }, 403);
  if (!(await getCurrentUser())) return json({ ok: false, error: "Please sign in again." }, 401);
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new TimesheetError("Choose a file first.");
    const bill = await addBill(String(form.get("claimId") ?? ""), file);
    refresh();
    return json({ ok: true, bill });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Request refused." }, 403);
  if (!(await getCurrentUser())) return json({ ok: false, error: "Please sign in again." }, 401);
  try {
    await removeBill(req.nextUrl.searchParams.get("id") ?? "");
    refresh();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
