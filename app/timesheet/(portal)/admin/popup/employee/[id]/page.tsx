import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/avatar";

// Opened any way other than from inside the admin area, an employee's pop-up address is just their page.
export default async function PopupEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`/timesheet/admin/access/${id}`);
}
