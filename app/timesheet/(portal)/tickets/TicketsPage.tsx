import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { isUuid } from "@/lib/avatar";
import { todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { listCategories, listTickets, ticketSummary, type Category, type Scope, type SortKey, type Summary, type TicketList } from "@/lib/tickets/server";
import TicketsView from "./TicketsView";

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const SORTS: SortKey[] = ["newest", "oldest", "updated", "due"];

// One of the three ticket lists. The page only asks; which tickets come back is decided by the database's row rules.
export default async function TicketsPage({ scope, searchParams, raise = false }: { scope: Scope; searchParams: Promise<Search>; /** Open the Raise ticket drawer straight away. */ raise?: boolean; /** Shown inside another page (the admin Projects tab): the heading is a level lower. */ }) {
  const user = await getCurrentUser();
  if (!user) redirect("/timesheet/login");
  const raw = await searchParams;
  const sort = first(raw.sort) as SortKey;

  let list: TicketList = { rows: [], total: 0, page: 1, pages: 1 };
  let summary: Summary = { total: 0, open: 0, inProgress: 0, pendingReview: 0, resolved: 0, overdue: 0 };
  let categories: Category[] = [];
  let error: string | null = null;
  try {
    [list, summary, categories] = await Promise.all([
      listTickets({
        scope,
        q: first(raw.q),
        status: first(raw.status),
        priority: first(raw.priority),
        category: first(raw.category),
        from: first(raw.from),
        to: first(raw.to),
        sort: SORTS.includes(sort) ? sort : "newest",
        page: Number(first(raw.page)) || 1,
      }),
      ticketSummary(scope),
      listCategories(),
    ]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("tickets-page", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  if (error) {
    return (
      <div className="ts-card ts-empty" role="alert">
        <strong>Couldn&apos;t load tickets</strong>
        <p>{error}</p>
      </div>
    );
  }

  const t = first(raw.t);
  return (
    <TicketsView
      scope={scope}
      list={list}
      summary={summary}
      categories={categories}
      who={{ id: user.id, name: user.name, email: user.email }}
      today={todayInOffice()}
      canRaise={user.role !== "viewer"}
      openId={isUuid(t) ? t : null}
      openRaise={user.role !== "viewer" && (raise || first(raw.new) === "1")}
    />
  );
}
