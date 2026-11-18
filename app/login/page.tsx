import { redirect } from "next/navigation";

// /login is the address people expect; the sign-in page lives under /timesheet.
export default function Login() {
  redirect("/timesheet/login");
}
