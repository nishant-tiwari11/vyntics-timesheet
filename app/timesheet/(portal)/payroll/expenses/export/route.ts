import { claimsCsv } from "@/lib/expenses/server";
import { isAdminFilter, type AdminFilter } from "@/lib/expenses/types";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The expense list as a CSV, with the payroll month and status of every claim. Admins only, and it uses the same filter,
// payroll-run and search choices as the page (everything that matches, not just what is on screen).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (user.role !== "admin") return new Response("Only admins can export expenses.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const filter: AdminFilter = isAdminFilter(params.get("filter")) ? (params.get("filter") as AdminFilter) : "all";
  const run = params.get("run") ?? "";
  const runId = UUID.test(run) ? run : null;
  const q = (params.get("q") ?? "").slice(0, 80);

  try {
    const csv = await claimsCsv({ filter: runId ? "all" : filter, runId, q });
    const name = `expenses_${runId ? "payroll-run" : filter}_${todayInOffice()}`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof TimesheetError) return new Response(e.message, { status: 400 });
    logError("expenses-export", e);
    return new Response("Couldn't export the expenses. Please try again.", { status: 500 });
  }
}
