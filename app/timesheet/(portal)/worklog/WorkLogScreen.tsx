import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice } from "@/lib/timesheet/dates";
import { activeProjectNames, allProjectNames } from "@/lib/timesheet/projectList";
import { listEmployees } from "@/lib/timesheet/admin";
import { parseWorkQuery, type WorkQuery } from "./query";
import { WorkLogView } from "./WorkLogView";

// The Work log page. Everything you choose (view, day, filters, search, sort, page) lives in the address. The page file is a thin
// wrapper around this, so the same screen can also be shown in a pop-up (`basePath` keeps its links on the pop-up's address).
export async function WorkLogScreen({ searchParams, basePath }: { searchParams: Promise<Record<string, string | string[] | undefined>>; basePath?: string }) {
  const [user, raw, projects, everyProject] = await Promise.all([getCurrentUser(), searchParams, activeProjectNames(), allProjectNames()]);
  const today = todayInOffice();
  // Only an admin imports, and only an admin may read the list of employees.
  const employees = user?.role === "admin" ? await listEmployees().then((l) => l.map((e) => ({ id: e.id, name: e.name }))).catch(() => []) : [];
  const parsed = parseWorkQuery(raw, today);

  // The grid shows a day or a week. An old "month" address (or a custom range) falls back to the week of that date.
  const query: WorkQuery = { ...parsed, view: parsed.view === "day" ? "day" : "week", from: "", to: "", ...(basePath ? { base: basePath } : {}) };
  return <WorkLogView query={query} today={today} admin={user?.role === "admin"} projects={projects} everyProject={everyProject} employees={employees} />;
}
