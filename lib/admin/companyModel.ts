// Sums for the company overview. Plain code with no server-only imports, so it can be tested on its own.

export type CountRow = { name: string; count: number };

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
