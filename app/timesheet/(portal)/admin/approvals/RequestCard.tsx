"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Home, Palmtree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PendingRequest } from "@/lib/timesheet/approvals";
import { formatRange, formatYmd } from "@/lib/timesheet/dates";
import { KIND_LABEL, PART_LABEL, dayWord, type LeaveKind } from "@/lib/timesheet/leaveCore";
import { cn } from "@/lib/utils";
import { UserAvatar } from "../../../_components/UserAvatar";
import { decideLeaveAction } from "./actions";

const monthName = (ym: string) => formatYmd(`${ym}-01`, { month: "long", year: "numeric" });

/** What each choice does, in a sentence, for this request. */
function effects(r: PendingRequest) {
  const over = r.paid.reduce((n, m) => n + m.over, 0);
  const left = r.paid.length > 0 ? Math.min(...r.paid.map((m) => m.left)) : 0;
  const co = r.compOff;
  return {
    over,
    left,
    paid: over > 0 ? `Over the monthly limit by ${dayWord(over)}. The extra will still be paid.` : `Uses ${dayWord(r.total)} of paid leave.`,
    comp: co ? (co.after < 0 ? `Balance goes ${co.now} to ${co.after}. They owe ${dayWord(co.owedAfter)} and pay it back by working a weekend or holiday.` : `Balance goes ${co.now} to ${co.after}.`) : "",
    unpaid: `${dayWord(r.total)} of pay is deducted.`,
  };
}

function suggested(r: PendingRequest): LeaveKind {
  const e = effects(r);
  if (e.over === 0) return "paid";
  if (r.compOff && r.compOff.after >= 0) return "comp_off";
  return "paid";
}

// One request waiting for a decision. Work from home is just approve or reject. Leave asks what kind it is, and shows what
// that choice does to the paid leave left and the comp-off balance.
export function RequestCard({ r }: { r: PendingRequest }) {
  const isLeave = r.type === "leave";
  const [kind, setKind] = useState<LeaveKind>(() => suggested(r));
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [pending, startTransition] = useTransition();
  const e = effects(r);

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideLeaveAction({ id: r.id, decision, kind: decision === "approved" && isLeave ? kind : null, note });
      if (!res.ok) return void toast.error(res.error);
      toast.success(decision === "approved" ? `Approved${isLeave ? ` as ${KIND_LABEL[kind].toLowerCase()}` : ""}.` : "Rejected.");
    });
  }

  const options: { id: LeaveKind; hint: string; warn: boolean }[] = [
    { id: "paid", hint: e.paid, warn: e.over > 0 },
    { id: "comp_off", hint: e.comp, warn: !!r.compOff && r.compOff.after < 0 },
    { id: "unpaid", hint: e.unpaid, warn: false },
  ];

  return (
    <li className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar userId={r.userId} name={r.name} className="size-10 text-sm" />
          <div className="min-w-0">
            <p className="font-medium">{r.name}</p>
            <p className="text-xs break-all text-muted-foreground">{r.email}</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium", isLeave ? "border-foreground" : "border-dashed")}>
          {isLeave ? <Palmtree className="size-4" aria-hidden="true" /> : <Home className="size-4" aria-hidden="true" />}
          {isLeave ? "Leave" : "Work from home"}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Dates</dt>
          <dd className="text-sm font-medium">{formatRange(r.from, r.to)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Length</dt>
          <dd className="text-sm font-medium">{r.total === 0 ? "Days off only (nothing counted)" : r.part !== "full" ? `${PART_LABEL[r.part]} · ${dayWord(r.total)}` : `${dayWord(r.total)} (weekends and holidays not counted)`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Reason</dt>
          <dd className="text-sm break-words">{r.reason || <span className="text-muted-foreground">None given</span>}</dd>
        </div>
      </dl>

      {r.alsoOff.length > 0 && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">Also off then:</span> {r.alsoOff.join(", ")}
        </p>
      )}

      {isLeave ? (
        <fieldset className="grid gap-2" disabled={pending}>
          <legend className="mb-1 text-sm font-medium">Approve as</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            {options.map((o) => (
              <label
                key={o.id}
                className={cn("flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-sm transition-colors", kind === o.id ? "border-foreground bg-accent" : "hover:border-foreground")}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input type="radio" name={`kind-${r.id}`} checked={kind === o.id} onChange={() => setKind(o.id)} className="size-4 accent-current" />
                  {KIND_LABEL[o.id]}
                </span>
                {o.id === "paid" && (
                  <span className="text-xs text-muted-foreground">
                    {r.paid.map((m) => `${monthName(m.month)}: ${dayWord(m.left)} left of ${m.quota}`).join(" · ") || "No working days in these dates"}
                  </span>
                )}
                {o.id === "comp_off" && r.compOff && <span className="text-xs text-muted-foreground">Balance now: {dayWord(r.compOff.now)}</span>}
                <span className={cn("flex items-start gap-1 text-xs", o.warn ? "text-orange-700" : "text-muted-foreground")}>
                  {o.warn && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                  {o.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Work from home is paid work, so no leave or comp-off is used.</p>
      )}

      {rejecting && (
        <div className="grid gap-1.5">
          <label htmlFor={`note-${r.id}`} className="text-sm font-medium">
            Reason for rejecting <span className="font-normal text-muted-foreground">(the employee sees this)</span>
          </label>
          <Textarea id={`note-${r.id}`} value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} maxLength={500} disabled={pending} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!rejecting ? (
          <>
            <Button type="button" onClick={() => decide("approved")} disabled={pending || (isLeave && r.total === 0)}>
              {pending ? "Saving..." : isLeave ? `Approve as ${KIND_LABEL[kind].replace(" (loss of pay)", "").toLowerCase()}` : "Approve"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>
              Reject
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="destructive" onClick={() => decide("rejected")} disabled={pending}>
              {pending ? "Saving..." : "Confirm reject"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRejecting(false)} disabled={pending}>
              Back
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
