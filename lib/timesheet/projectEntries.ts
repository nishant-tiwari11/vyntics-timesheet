import "server-only";
import { db, requireAdmin } from "./auth";
import { toError } from "./errors";
import { displayName } from "./people";

// Every work log entry for one project, for the admin. Admin only; the database lets only admins read everyone's logs anyway.

export type ProjectEntry = { id: string; userId: string; person: string; date: string; start: string; end: string; hours: number; text: string; status: string };
export type ProjectPerson = { userId: string; person: string; entries: number; hours: number };

const LIMIT = 1000;

export async function listProjectEntries(projectName: string): Promise<{ entries: ProjectEntry[]; people: ProjectPerson[]; total: number; truncated: boolean }> {
  await requireAdmin();
  const supabase = await db();
  const { data, error, count } = await supabase
    .from("work_logs")
    .select("id, user_id, log_date, start_time, end_time, hours, content, status, owner:profiles!work_logs_user_id_fkey(full_name, email)", { count: "exact" })
    .eq("project", projectName)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw toError(error, "Couldn't load the entries. Please try again.");

  const entries = data.map((r): ProjectEntry => ({
    id: r.id,
    userId: r.user_id,
    person: displayName(r.owner),
    date: r.log_date,
    start: r.start_time?.slice(0, 5) ?? "",
    end: r.end_time?.slice(0, 5) ?? "",
    hours: r.hours ?? 0,
    text: r.content,
    status: r.status,
  }));

  const by = new Map<string, ProjectPerson>();
  for (const e of entries.filter((x) => x.status !== "rejected")) {
    const p = by.get(e.userId) ?? { userId: e.userId, person: e.person, entries: 0, hours: 0 };
    p.entries += 1;
    p.hours = Math.round((p.hours + e.hours) * 100) / 100;
    by.set(e.userId, p);
  }
  return { entries, people: [...by.values()].sort((a, b) => b.hours - a.hours), total: count ?? entries.length, truncated: (count ?? 0) > entries.length };
}
