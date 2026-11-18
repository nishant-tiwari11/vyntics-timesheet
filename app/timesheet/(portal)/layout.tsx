import { redirect } from "next/navigation";
import { getAccessBlock, getCurrentUser } from "@/lib/supabase/getCurrentUser";
import Shell from "../_components/Shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Still signed in but no longer allowed (disabled, expired, or signed in too long ago): end the session.
  const block = await getAccessBlock();
  if (block) redirect(`/timesheet/auth/signout?reason=${block}`);
  const user = await getCurrentUser();
  if (!user) redirect("/timesheet/login");

  return (
    <Shell id={user.id} email={user.email} name={user.name} role={user.role}>
      {children}
    </Shell>
  );
}
