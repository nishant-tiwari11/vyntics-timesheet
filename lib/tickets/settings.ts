import "server-only";
import { isUuid } from "@/lib/avatar";
import { db, requireAdmin } from "@/lib/timesheet/auth";
import { TimesheetError, toError } from "@/lib/timesheet/errors";

// Ticket Settings: the categories and the support staff of each department. Admin only; the database checks again inside each
// function (supabase/step46_ticket_settings.sql) and writes every change to the audit log.

const NOT_SET_UP = "Ticket settings aren't set up yet. Run supabase/step45_tickets.sql and step46_ticket_settings.sql in Supabase.";

type Client = Awaited<ReturnType<typeof db>>;
const from = (c: Client, table: string) => c.from(table as never);
const missing = (e: { message: string; code?: string }) => e.code !== "P0001" && /relation|function|does not exist|schema cache/i.test(e.message);

export type SettingsCategory = { id: string; name: string; department: string; sensitive: boolean; active: boolean; tickets: number };
export type SettingsPerson = { id: string; name: string; email: string };
export type SettingsData = {
  categories: SettingsCategory[];
  departments: string[];
  support: { userId: string; department: string }[];
  people: SettingsPerson[];
};

export async function loadTicketSettings(): Promise<SettingsData> {
  await requireAdmin();
  const supabase = await db();
  const [cats, used, support, people] = await Promise.all([
    from(supabase, "ticket_categories").select("id, name, department, sensitive, active").order("sort").order("name"),
    from(supabase, "tickets").select("category_id").limit(20000),
    from(supabase, "ticket_support").select("user_id, department"),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").neq("role", "viewer").order("full_name"),
  ]);
  for (const r of [cats, used, support]) if (r.error) throw missing(r.error) ? new TimesheetError(NOT_SET_UP) : toError(r.error, "Couldn't load the ticket settings. Please try again.");
  if (people.error) throw toError(people.error, "Couldn't load the people. Please try again.");

  const count = new Map<string, number>();
  for (const t of (used.data ?? []) as unknown as { category_id: string }[]) count.set(t.category_id, (count.get(t.category_id) ?? 0) + 1);
  const categories = (cats.data as unknown as Omit<SettingsCategory, "tickets">[]).map((c) => ({ ...c, tickets: count.get(c.id) ?? 0 }));
  const sup = (support.data ?? []) as unknown as { user_id: string; department: string }[];
  const departments = [...new Set([...categories.map((c) => c.department), ...sup.map((s) => s.department)])].sort((a, b) => a.localeCompare(b));
  return {
    categories,
    departments,
    support: sup.map((s) => ({ userId: s.user_id, department: s.department })),
    people: people.data.map((p) => ({ id: p.id, name: p.full_name?.trim() || p.email, email: p.email })),
  };
}

async function rpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw missing(error) ? new TimesheetError(NOT_SET_UP) : toError(error, fallback);
  return data;
}

export type CategoryInput = { id?: string; name: string; department: string; sensitive?: boolean; active?: boolean };

export async function saveCategory(input: CategoryInput): Promise<void> {
  if (input.id !== undefined && !isUuid(input.id)) throw new TimesheetError("That category could not be found.");
  await rpc("ticket_category_save", { p_id: input.id ?? null, p_name: input.name, p_department: input.department, p_sensitive: input.sensitive ?? null, p_active: input.active ?? null }, "Couldn't save the category. Please try again.");
}

export async function reorderCategories(ids: string[]): Promise<void> {
  if (!ids.every(isUuid)) throw new TimesheetError("That category could not be found.");
  await rpc("ticket_category_reorder", { p_ids: ids }, "Couldn't change the order. Please try again.");
}

export async function setSupport(userId: string, department: string, on: boolean): Promise<void> {
  if (!isUuid(userId)) throw new TimesheetError("Choose a person.");
  await rpc("ticket_support_set", { p_user: userId, p_department: department, p_on: on }, "Couldn't change the support team. Please try again.");
}
