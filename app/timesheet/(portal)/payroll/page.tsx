import { redirect } from "next/navigation";

export default function PayrollIndex() {
  redirect("/timesheet/payroll/runs");
}
