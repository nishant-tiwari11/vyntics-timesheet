import "server-only";
import { requireAdmin } from "@/lib/timesheet/auth";
import { loadCompanyOverview, type CompanyOverview } from "./company";
import { loadAdminOverview, type AdminOverview } from "./overview";

// Opening an employee on the Admin overview asks the server for the page again (the address now names the person). Everything on the
// overview would be worked out again for that, a few seconds, only to show the same numbers. So while a person is open the numbers
// from a moment ago are used again, and fresh ones are read whenever the plain overview is shown. Kept per admin, for a short time.
const TTL_MS = 20_000;
const saved = new Map<string, { at: number; value: [AdminOverview, CompanyOverview] }>();

export async function loadOverviewData(reuseRecent: boolean): Promise<[AdminOverview, CompanyOverview]> {
  const me = await requireAdmin(); // the page checks too; this keeps the saved copy from ever being handed to anyone else
  const hit = saved.get(me.id);
  if (reuseRecent && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await Promise.all([loadAdminOverview(), loadCompanyOverview()]);
  if (saved.size > 50) saved.clear();
  saved.set(me.id, { at: Date.now(), value });
  return value;
}
