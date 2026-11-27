import { todayInOffice } from "@/lib/timesheet/dates";
import { activeProjectNames, allProjectNames } from "@/lib/timesheet/projectList";
import { parseWorkQuery, type WorkQuery } from "../worklog/query";
import { WorkLogView } from "../worklog/WorkLogView";

export const OVERVIEW_PATH = "/timesheet/admin";

// One employee's whole timesheet, shown under their orb on the Admin overview: the week or day, filters and every entry, grouped by
// day. It is the Work log page's own set of components, fixed to this person; its links stay on the overview (and keep the person open).
export async function EmployeeTimesheet({ userId, name, raw }: { userId: string; name: string; raw: Record<string, string | string[] | undefined> }) {
  const [projects, everyProject] = await Promise.all([activeProjectNames(), allProjectNames()]);
  const today = todayInOffice();
  const parsed = parseWorkQuery(raw, today);
  const query: WorkQuery = { ...parsed, user: userId, view: parsed.view === "day" ? "day" : "week", from: "", to: "", base: OVERVIEW_PATH, keep: { employee: userId }, pinnedUser: true };
  return (
    <section id="employee-timesheet" aria-label={`${name}'s timesheet`} className="scroll-mt-4">
      <WorkLogView query={query} today={today} admin projects={projects} everyProject={everyProject} employees={[]} embedded title={`${name}'s timesheet`} subtitle="Their hours, day by day. Switch between a day and a week, filter, or export." />
    </section>
  );
}
