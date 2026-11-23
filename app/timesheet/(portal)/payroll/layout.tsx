import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import PayrollHeading from "./PayrollHeading";

// Payroll is for admins only. This is the server-side check for every page under /timesheet/payroll; the data functions
// check again, and the database refuses anyone else. The pages themselves are reached from the sidebar (Expenses and Payroll
// groups), so there is no tab strip here.
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  return (
    <div className="grid gap-6">
      <PayrollHeading />
      {children}
    </div>
  );
}
