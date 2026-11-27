"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { WorkingPerson } from "@/lib/admin/companyModel";
import { OFFICE_TIME_ZONE } from "@/lib/timesheet/dates";
import { UserAvatar } from "../../_components/UserAvatar";

type Queue = { label: string; count: number | null; href: string };
const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: OFFICE_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

export function SummaryCardDialog({ title, children, working, queues, dutyUnavailable = false }: { title: string; children: ReactNode; working?: WorkingPerson[] | null; queues?: Queue[]; dutyUnavailable?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="group flex h-full w-full items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring">{children}</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{queues ? "Choose a category to review its pending items." : "Employees who went on duty or logged time today. Start times are in IST."}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto">
          {dutyUnavailable && <p className="mb-3 text-sm text-muted-foreground">Duty records couldn&apos;t be loaded. This list currently includes employees with logged time.</p>}
          {queues ? (
            <ul className="grid gap-2">
              {queues.map((queue) => <li key={queue.href}><Link href={queue.href} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent"><span className="font-medium">{queue.label}</span><span className="ml-auto tabular-nums">{queue.count ?? "–"}</span><ArrowRight className="size-4" aria-hidden="true" /></Link></li>)}
            </ul>
          ) : working == null ? <p className="text-sm text-muted-foreground">Couldn&apos;t load today&apos;s employees.</p> : working.length === 0 ? <p className="text-sm text-muted-foreground">{dutyUnavailable ? "No employees with logged time today." : "Nobody has gone on duty or logged time today."}</p> : (
            <>
              <ul className="divide-y">
                {working.map((person) => <li key={person.id} className="flex items-center gap-3 py-3"><UserAvatar userId={person.id} name={person.name} className="size-9 shrink-0 text-xs" /><div className="min-w-0 flex-1"><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.startedAt ? `${person.onDuty ? "On duty now" : "Off duty"}${person.location === "wfh" ? " · Working from home" : person.location === "office" ? " · Office" : ""}` : "Logged time only"}</p></div><div className="text-right text-sm"><p className="text-xs text-muted-foreground">Duty started</p><p className="font-medium tabular-nums">{person.startedAt ? time(person.startedAt) : "No duty start recorded"}</p></div></li>)}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
