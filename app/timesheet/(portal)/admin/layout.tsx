import "../dashboard/dashboard.css"; // chips, buttons, skeleton
import "./admin.css";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import AdminNav from "./AdminNav";

// Every page under /timesheet/admin: the admin check (proxy.ts also blocks non-admins, and each page and action checks again),
// and the Admin menu at the top.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  return (
    <div className="ts-page">
      <Suspense fallback={<div className="ts-admin-tabs h-[43px]" aria-hidden="true" />}>
        <AdminNav />
      </Suspense>
      {children}
    </div>
  );
}
