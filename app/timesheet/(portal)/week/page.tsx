import { redirect } from "next/navigation";

// The weekly timesheet lives at /timesheet/timesheet.
export default function WeekRedirect() {
  redirect("/timesheet/timesheet");
}
