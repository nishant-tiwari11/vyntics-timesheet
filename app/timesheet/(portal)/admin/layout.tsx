import "../dashboard/dashboard.css"; // chips, buttons, skeleton
import "./admin.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";

// Every page under /timesheet/admin: the admin check (proxy.ts also blocks non-admins, and each page and action checks again).
// The menu lives in the sidebar (or the floating menu), not on the page.
export default async function AdminLayout({ children, modal }: { children: React.ReactNode; /** A page opened in a window over this one (the @modal slot). */ modal: React.ReactNode }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");

  return (
    <div className="ts-page">
      {children}
      {modal}
    </div>
  );
}
