import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import Shell from "../_components/Shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/timesheet/login");

  return (
    <Shell email={user.email} name={user.name} role={user.role}>
      {children}
    </Shell>
  );
}
