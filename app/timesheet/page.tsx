import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";

// proxy.ts sends signed-out visitors on to /timesheet/login. Admins start on their own overview; everyone else on the dashboard.
export default async function TimesheetIndex() {
  const me = await getCurrentUser();
  redirect(me?.role === "admin" ? "/timesheet/admin" : "/timesheet/dashboard");
}
