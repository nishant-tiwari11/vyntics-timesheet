import { redirect } from "next/navigation";

// proxy.ts sends signed-out visitors on to /timesheet/login.
export default function TimesheetIndex() {
  redirect("/timesheet/dashboard");
}
