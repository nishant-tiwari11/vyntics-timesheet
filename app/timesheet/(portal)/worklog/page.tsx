import { redirect } from "next/navigation";

// The work log lives on the dashboard.
export default function WorkLogPage() {
  redirect("/timesheet/dashboard#worklog");
}
