import { CalendarX2, Clock, Hourglass, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatYmd } from "@/lib/timesheet/dates";
import { loadWorkLog } from "./data";
import { fmtHours, summarize } from "./model";
import type { WorkQuery } from "./query";

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-1 px-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true">{icon}</span>
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

// Total hours, the target and what is left, working days with nothing logged, and entries waiting for approval.
export async function SummaryCards({ query }: { query: WorkQuery }) {
  const res = await loadWorkLog(query);
  if (!res.ok) return null; // the list below shows the error and the retry button

  const { entries, period, today, me, offDays, leaveDays } = res.data;
  const mine = entries.filter((e) => e.userId === me.id);
  const pending = me.admin ? entries.filter((e) => e.status === "pending" && e.userId !== me.id).length : mine.filter((e) => e.status === "pending").length;
  const s = summarize({ mine, from: period.from, to: period.to, today, offDays, leaveDays, pendingApprovals: pending });
  const pct = s.target ? Math.min(Math.round((s.total / s.target) * 100), 100) : 0;
  const shown = s.missingDays.slice(0, 3).map((d) => formatYmd(d, { weekday: "short", day: "numeric" }));

  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={<Clock className="size-4" />}
        label={me.admin ? "Your hours" : "Hours logged"}
        value={`${fmtHours(s.total)} h`}
        note={`${s.workingDays} working ${s.workingDays === 1 ? "day" : "days"} in this period`}
      />
      <Stat
        icon={<Target className="size-4" />}
        label="Target"
        value={`${fmtHours(s.target)} h`}
        note={
          <>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
              <span className="block h-full bg-foreground" style={{ width: `${pct}%` }} />
            </span>
            <span className="mt-1 block">
              {s.remaining === 0 && s.target > 0 ? "Target met" : `${fmtHours(s.remaining)} h remaining`}
            </span>
          </>
        }
      />
      <Stat
        icon={<CalendarX2 className="size-4" />}
        label="Days with no entry"
        value={s.missingDays.length}
        note={
          s.missingDays.length === 0
            ? "Every working day so far is logged"
            : `${shown.join(", ")}${s.missingDays.length > shown.length ? ` and ${s.missingDays.length - shown.length} more` : ""}`
        }
      />
      <Stat
        icon={<Hourglass className="size-4" />}
        label={me.admin ? "Waiting for your decision" : "Pending approval"}
        value={s.pendingApprovals}
        note={me.admin ? "Entries from others in this period" : "Entries not yet approved"}
      />
    </section>
  );
}

