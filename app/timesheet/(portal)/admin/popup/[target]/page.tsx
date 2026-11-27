import { notFound, redirect } from "next/navigation";
import { POPUP_TARGETS, isPopupTarget, queryString } from "../targets";

// Opened any way other than from inside the admin area (a refresh, a shared or typed link), the pop-up address is just the real page.
export default async function PopupTargetPage({ params, searchParams }: { params: Promise<{ target: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { target } = await params;
  if (!isPopupTarget(target)) notFound();
  redirect(`${POPUP_TARGETS[target].path}${queryString(await searchParams)}`);
}
