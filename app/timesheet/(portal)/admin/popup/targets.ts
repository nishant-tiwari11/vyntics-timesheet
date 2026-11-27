// The pages the orb's buttons open in a pop-up. The pop-up address is /timesheet/admin/popup/<name>; opened from inside the admin
// area it shows the real page in a window (see @modal), and opened any other way (a refresh, a shared link) it goes to the real page.
// Plain code with no imports of pages, so the redirect route stays light.

export const POPUP_BASE = "/timesheet/admin/popup";

export const POPUP_TARGETS = {
  worklog: { title: "Work log", path: "/timesheet/worklog" },
  approvals: { title: "Leave & approvals", path: "/timesheet/admin/approvals" },
  expenses: { title: "Expenses", path: "/timesheet/payroll/expenses" },
  payroll: { title: "Payroll history", path: "/timesheet/payroll/history" },
  documents: { title: "Documents", path: "/timesheet/admin/documents" },
} as const;

export type PopupTarget = keyof typeof POPUP_TARGETS;
export const isPopupTarget = (v: string): v is PopupTarget => Object.hasOwn(POPUP_TARGETS, v);

/** An address's settings as a query string ("?a=1&b=2", or nothing). */
export function queryString(raw: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  const out = qs.toString();
  return out ? `?${out}` : "";
}
