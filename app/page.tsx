import { redirect } from "next/navigation";

// SCAFFOLD ONLY: stands in for the existing Vyntics home page, which your real site already has.
// While this project is deployed on its own, the plain address opens the portal.
export default function Home() {
  redirect("/timesheet");
}
