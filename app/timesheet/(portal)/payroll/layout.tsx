import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import PayrollTabs from "./PayrollTabs";

// Payroll is for admins only. This is the server-side check for every page under /timesheet/payroll; the data functions
// check again, and the database refuses anyone else.
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="text-sm text-muted-foreground">Salary data is private to admins. Every view and change is recorded in the activity log.</p>
      </div>
      <PayrollTabs />
      {children}
    </div>
  );
}
