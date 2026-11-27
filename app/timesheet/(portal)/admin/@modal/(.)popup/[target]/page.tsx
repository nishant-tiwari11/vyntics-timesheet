import { notFound } from "next/navigation";
import { PageModal } from "../../../popup/PageModal";
import { renderTarget } from "../../../popup/renderTarget";
import { POPUP_TARGETS, isPopupTarget } from "../../../popup/targets";

// Opened from inside the admin area (the orb's buttons), the real page is shown in a window over the page you are on.
export default async function PopupWindow({ params, searchParams }: { params: Promise<{ target: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { target } = await params;
  if (!isPopupTarget(target)) notFound();
  return <PageModal title={POPUP_TARGETS[target].title}>{renderTarget(target, searchParams)}</PageModal>;
}
