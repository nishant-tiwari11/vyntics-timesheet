import "../../dashboard/dashboard.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENGAGEMENT_TYPES } from "@/lib/offers/types";
import { ENGAGEMENT_LABEL, OFFER_STATUSES, listOffers, type OfferStatus } from "@/lib/offers/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { listEmployees } from "@/lib/timesheet/admin";
import { formatInstantDate } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { NewLetterPicker } from "./NewLetterPicker";

export const metadata = { title: "Offer letters (admin)" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUS_LABEL: Record<OfferStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted" };
const selectClass = "h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm max-md:h-11";

// Every offer letter (the current version of each), with filters by type and status and a name search. Admin only.
export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/timesheet/dashboard");
  const raw = await searchParams;
  const filter = { type: one(raw.type), status: one(raw.status), q: one(raw.q).slice(0, 60) };

  let list;
  let people: { id: string; name: string }[] = [];
  try {
    [list, people] = await Promise.all([listOffers(filter), listEmployees().then((l) => l.filter((p) => p.role !== "viewer").map((p) => ({ id: p.id, name: p.name })))]);
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("offers page", e);
    return (
      <p className="ts-alert" role="alert">
        {e instanceof TimesheetError ? e.message : "Something went wrong. Please try again."}
      </p>
    );
  }
  const filtered = !!(filter.type || filter.status || filter.q);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="ts-h1">Offer letters</h1>
          <p className="ts-muted">One template, four kinds of letter. Create a draft, send it, and the employee accepts it in the portal.</p>
        </div>
        <Button asChild variant="outline" className="max-md:min-h-11">
          <Link href="/timesheet/admin/offers/settings">
            <Settings aria-hidden="true" /> Company and wording
          </Link>
        </Button>
      </div>

      {!list.ready ? (
        <p role="note" className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Offer letters aren&apos;t set up yet. Run <code>supabase/step41_offer_letters.sql</code> in Supabase.
        </p>
      ) : (
        <>
          <NewLetterPicker people={people} />

          <form role="search" aria-label="Filter the letters" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <label htmlFor="of-q" className="text-sm font-medium">
                Search by name
              </label>
              <input id="of-q" name="q" defaultValue={filter.q} maxLength={60} placeholder="Name" className="h-9 w-56 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus-visible:border-foreground max-md:h-11" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="of-type" className="text-sm font-medium">
                Type
              </label>
              <select id="of-type" name="type" defaultValue={filter.type} className={selectClass}>
                <option value="">All types</option>
                {ENGAGEMENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="of-status" className="text-sm font-medium">
                Status
              </label>
              <select id="of-status" name="status" defaultValue={filter.status} className={selectClass}>
                <option value="">All statuses</option>
                {OFFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" className="max-md:min-h-11">
              Apply
            </Button>
            {filtered && (
              <Button asChild variant="ghost" className="max-md:min-h-11">
                <Link href="/timesheet/admin/offers">Clear</Link>
              </Button>
            )}
          </form>

          {list.rows.length === 0 ? (
            <div className="ts-card ts-empty">
              <strong>{filtered ? "No letters match" : "No offer letters yet"}</strong>
              <p>{filtered ? "Try a different filter." : "Choose an employee above and click Generate offer letter."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Offer letters, newest change first</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last change</TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{ENGAGEMENT_LABEL[r.type]}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "draft" ? "outline" : "default"}>{STATUS_LABEL[r.status]}</Badge>
                        {r.status === "accepted" && r.acceptedAt && <span className="mt-1 block text-xs text-muted-foreground">{formatInstantDate(r.acceptedAt)}</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">v{r.version}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatInstantDate(r.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline" className="max-md:min-h-11">
                          <Link href={`/timesheet/admin/offers/${r.id}`}>{r.status === "draft" ? "Edit" : "Open"}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {list.truncated && <p className="text-xs text-muted-foreground">Showing the latest 300. Use the filters to narrow it down.</p>}
        </>
      )}
    </div>
  );
}
