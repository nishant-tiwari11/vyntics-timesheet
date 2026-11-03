import { redirect } from "next/navigation";

// Leave and WFH requests live on the dashboard.
export default function LeavePage() {
  redirect("/timesheet/dashboard#leave");
}
