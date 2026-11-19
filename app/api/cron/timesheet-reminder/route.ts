import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runJob, type Job } from "@/lib/reminders/run";
import { logError } from "@/lib/timesheet/log";

// Called by Vercel Cron (see vercel.json), never by a person. Vercel sends "Authorization: Bearer <CRON_SECRET>".
//   /api/cron/timesheet-reminder                  the daily "you have logged less than the target" message
//   /api/cron/timesheet-reminder?job=summary      the Friday week summary
//   /api/cron/timesheet-reminder?job=approvals    the pending-approvals message to managers and admins
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const JOBS: Job[] = ["reminder", "summary", "approvals"];

const digest = (v: string) => createHash("sha256").update(v).digest();

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret set: nobody gets in
  const sent = req.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(sent), digest(`Bearer ${secret}`));
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    logError("cron reminder", new Error("CRON_SECRET is not set"));
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 500, headers: HEADERS });
  }
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: HEADERS });

  const asked = req.nextUrl.searchParams.get("job") ?? "reminder";
  const job = JOBS.find((j) => j === asked);
  if (!job) return NextResponse.json({ ok: false, error: "Unknown job." }, { status: 400, headers: HEADERS });

  try {
    return NextResponse.json({ ok: true, ...(await runJob(job)) }, { headers: HEADERS });
  } catch (e) {
    logError(`cron ${job}`, e);
    return NextResponse.json({ ok: false, error: "The job failed. See the server log." }, { status: 500, headers: HEADERS });
  }
}
