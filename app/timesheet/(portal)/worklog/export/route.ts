import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { loadWorkLog } from "../data";
import { filterEntries, toCsv } from "../model";
import { parseWorkQuery } from "../query";

// The filtered Work log as a CSV file: everything that matches (not just the page on screen), in the same order as the
// list. It reads through the same loader as the page, so you only ever get entries you are allowed to see.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });

  const today = todayInOffice();
  const query = parseWorkQuery(Object.fromEntries(new URL(request.url).searchParams), today);
  const res = await loadWorkLog(query);
  if (!res.ok) return new Response(res.error, { status: 500 });

  const rows = filterEntries(res.data.entries, query).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const { from, to } = res.data.period;
  return new Response(toCsv(rows, res.data.me.admin), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="work-log_${from}_to_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
