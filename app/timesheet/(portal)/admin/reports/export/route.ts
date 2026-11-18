import { loadReport, tableToXlsx } from "@/lib/admin/reports";
import { parseReportQuery, rangeLabel, tableToCsv } from "@/lib/admin/reportsModel";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";

// The report on the page as an Excel file (or CSV with ?format=csv): everything that matches, not just what fits on screen.
// Admins only. It uses the same loader as the page, so the file always matches what you see.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (user.role !== "admin") return new Response("Only admins can do that.", { status: 403 });

  const url = new URL(request.url);
  const query = parseReportQuery(Object.fromEntries(url.searchParams), todayInOffice());
  try {
    const { table } = await loadReport(query);
    const name = `report-${query.report}_${query.from}_to_${query.to}`;
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (url.searchParams.get("format") === "csv") {
      return new Response(tableToCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
    }
    return new Response(new Uint8Array(await tableToXlsx(table, rangeLabel(query.from, query.to))), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin report export", e);
    return new Response(e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.", { status: 500 });
  }
}
