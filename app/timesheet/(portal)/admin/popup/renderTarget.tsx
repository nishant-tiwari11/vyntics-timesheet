import ApprovalsPage from "../approvals/page";
import AdminDocumentsPage from "../documents/page";
import EmployeePage from "../access/[id]/page";
import PayrollExpensesPage from "../../payroll/expenses/page";
import PayrollHistoryPage from "../../payroll/history/page";
import { WorkLogScreen } from "../../worklog/WorkLogScreen";
import { POPUP_BASE, type PopupTarget } from "./targets";

type Raw = Promise<Record<string, string | string[] | undefined>>;

/**
 * The real page for a pop-up, built from the same component the normal page uses, so the pop-up always matches it. The Work log
 * keeps its own links on the pop-up's address (so changing the week or a filter doesn't leave the window); the other pages are
 * shown as they are.
 */
export function renderTarget(target: PopupTarget, searchParams: Raw) {
  switch (target) {
    case "worklog":
      return <WorkLogScreen searchParams={searchParams} basePath={`${POPUP_BASE}/worklog`} />;
    case "approvals":
      return <ApprovalsPage searchParams={searchParams} />;
    case "expenses":
      return <PayrollExpensesPage searchParams={searchParams} />;
    case "payroll":
      return <PayrollHistoryPage searchParams={searchParams} />;
    case "documents":
      return <AdminDocumentsPage searchParams={searchParams} />;
  }
}

/** An employee's own page in a pop-up. */
export const renderEmployee = (id: string) => <EmployeePage params={Promise.resolve({ id })} />;
