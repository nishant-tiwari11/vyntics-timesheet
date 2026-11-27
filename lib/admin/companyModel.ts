// Sums for the company overview. Plain code with no server-only imports, so it can be tested on its own.

export type CountRow = { name: string; count: number };

export type WorkingPerson = { id: string; name: string; startedAt: string | null; onDuty: boolean; location: string | null };
/** Someone on approved leave today: the request's dates, which part of the day, and what kind of leave it was approved as. */
export type LeaveToday = { id: string; name: string; from: string; to: string; part: string; kind: string | null };

/** Someone working from home today: by an approved request (with its dates), or because they went on duty from home. */
export type WfhToday = { id: string; name: string; approved: { from: string; to: string; part: string } | null; dutyStartedAt: string | null; onDuty: boolean };

/** One expense claim waiting for a decision, as the overview's Expense claims card lists it. */
export type PendingClaim = { id: string; code: string; userId: string; employee: string; category: string; description: string; date: string; claimed: number };

export type DutyTodayRow = { user_id: string; started_at: string; ended_at: string | null; location: string };

/** The roster and the summary count must use the same people, including work-log-only entries. */
export function workingToday(people: { id: string; name: string }[], duty: DutyTodayRow[], hours: Map<string, number>): WorkingPerson[] {
  const byUser = new Map<string, DutyTodayRow[]>();
  for (const row of duty) {
    const rows = byUser.get(row.user_id) ?? [];
    rows.push(row);
    byUser.set(row.user_id, rows);
  }
  return people.flatMap((person) => {
    const rows = (byUser.get(person.id) ?? []).sort((a, b) => a.started_at.localeCompare(b.started_at));
    if (!rows.length && (hours.get(person.id) ?? 0) <= 0) return [];
    const current = rows.find((row) => row.ended_at === null);
    return [{ ...person, startedAt: rows[0]?.started_at ?? null, onDuty: !!current, location: (current ?? rows.at(-1))?.location ?? null }];
  }).sort((a, b) => Number(b.onDuty) - Number(a.onDuty) || a.name.localeCompare(b.name));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** How many of each value, biggest first; empty values are grouped as `blank`. At most `limit` rows, the rest joined as "Others". */
export function countBy(values: string[], blank = "No department", limit = 6): CountRow[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v.trim() || blank;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const rows = [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1).reduce((n, r) => n + r.count, 0);
  return [...rows.slice(0, limit - 1), { name: "Others", count: rest }];
}

export type LogLite = { date: string; project: string; hours: number; status: string };

/** Hours per day for the given days (YYYY-MM-DD), and per project (top five). Rejected entries don't count. */
export function weekHours(logs: LogLite[], days: string[]): { perDay: { date: string; hours: number }[]; total: number; projects: CountRow[] } {
  const kept = logs.filter((l) => l.status !== "rejected" && days.includes(l.date));
  const perDay = days.map((date) => ({ date, hours: round(kept.filter((l) => l.date === date).reduce((n, l) => n + l.hours, 0)) }));
  const byProject = new Map<string, number>();
  for (const l of kept) byProject.set(l.project || "Other", (byProject.get(l.project || "Other") ?? 0) + l.hours);
  const projects = [...byProject]
    .map(([name, h]) => ({ name, count: round(h) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
  return { perDay, total: round(perDay.reduce((n, d) => n + d.hours, 0)), projects };
}
