import "../dashboard/dashboard.css";
import "../admin/admin.css"; // the Admin menu bar styles
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import AdminNav from "../admin/AdminNav";
import PayrollTabs from "./PayrollTabs";

// Payroll is for admins only, and sits under the Admin menu. This is the server-side check for every page under /timesheet/payroll; the data functions
// check again, and the database refuses anyone else.
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  return (
    <div className="grid gap-6">
      {/* Payroll belongs to the Admin section, so the Admin menu stays on top and "Payroll & Expenses" stays highlighted. */}
      <Suspense fallback={<div className="ts-admin-tabs h-[43px]" aria-hidden="true" />}>
        <AdminNav />
      </Suspense>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="text-sm text-muted-foreground">Salary data is private to admins. Every view and change is recorded in the activity log.</p>
      </div>
      <PayrollTabs />
      {children}
    </div>
  );
}
