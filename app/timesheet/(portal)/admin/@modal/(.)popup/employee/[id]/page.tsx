import { notFound } from "next/navigation";
import { isUuid } from "@/lib/avatar";
import { PageModal } from "../../../../popup/PageModal";
import { renderEmployee } from "../../../../popup/renderTarget";

// An employee's own page, in a window.
export default async function PopupEmployeeWindow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <PageModal title="Employee">{renderEmployee(id)}</PageModal>;
}
