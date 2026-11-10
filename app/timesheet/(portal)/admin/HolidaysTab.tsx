import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { HOLIDAY_TYPES, holidayTypeLabel, type Holiday, type HolidayType } from "@/lib/timesheet/holidayTypes";
import { listHolidays } from "@/lib/timesheet/holidays";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { cn } from "@/lib/utils";
import { SectionError } from "../dashboard/sections";
import { AddHolidayButton, HolidayActions, ImportHolidays, MarkReviewedButton } from "./HolidayControls";

const BASE = "/timesheet/admin?tab=holidays";

const pill = (active: boolean) =>
  cn(
    "inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent",
    active && "border-primary bg-primary text-primary-foreground hover:bg-primary"
  );

export async function HolidaysTab({ yearParam, typeParam }: { yearParam?: string; typeParam?: string }) {
  const thisYear = Number(todayInOffice().slice(0, 4));
  const parsed = Number(yearParam);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : thisYear;
  const type = HOLIDAY_TYPES.find((t) => t.id === typeParam)?.id as HolidayType | undefined;
  const link = (y: number, t?: HolidayType) => `${BASE}&year=${y}${t ? `&type=${t}` : ""}`;

  let list: Holiday[] = [];
  let error: string | null = null;
  try {
    list = await listHolidays({ year, type });
  } catch (e) {
    if (!(e instanceof TimesheetError)) logError("admin-holidays", e);
    error = e instanceof TimesheetError ? e.message : "Something went wrong. Please try again.";
  }

  const unreviewed = list.filter((h) => !h.reviewed).length;
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  if (!years.includes(year)) years.push(year);

  return (
    <section className="grid gap-4" aria-label="Holidays">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Year" className="flex flex-wrap gap-1.5">
          {years.sort().map((y) => (
            <Link key={y} href={link(y, type)} aria-current={y === year ? "page" : undefined} className={pill(y === year)}>
              {y}
            </Link>
          ))}
        </nav>
        <nav aria-label="Type" className="flex flex-wrap gap-1.5 sm:ml-2">
          <Link href={link(year)} aria-current={!type ? "page" : undefined} className={pill(!type)}>
            All types
          </Link>
          {HOLIDAY_TYPES.map((t) => (
            <Link key={t.id} href={link(year, t.id)} aria-current={type === t.id ? "page" : undefined} className={pill(type === t.id)}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap gap-2">
          <ImportHolidays />
          <AddHolidayButton defaultYear={year} />
        </div>
      </div>

      {unreviewed > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
          <p className="min-w-0 flex-1">
            <strong>{unreviewed} {unreviewed === 1 ? "holiday needs" : "holidays need"} review.</strong> Festival and religious dates change every year, so
            the starter dates may be a day off. Compare each with your official company holiday list, fix any that differ, then mark them reviewed.
          </p>
          <MarkReviewedButton year={year} count={unreviewed} />
        </div>
      )}

      {error ? (
        <div className="ts-card">
          <SectionError message={error} />
          <Link href={link(year, type)} className="ts-btn ts-btn-sm">
            Try again
          </Link>
        </div>
      ) : list.length === 0 ? (
        <div className="ts-card ts-empty">
          <strong>No holidays in {year}{type ? ` (${holidayTypeLabel(type)})` : ""}</strong>
          <p>Use Add holiday, or Import CSV to add many at once.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatYmd(h.date, { weekday: "short", day: "numeric", month: "short" })}</TableCell>
                  <TableCell className="min-w-48">
                    <div className="font-medium">{h.name}</div>
                    {h.description && <div className="text-xs text-muted-foreground">{h.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={h.type === "optional" ? "outline" : "secondary"}>{holidayTypeLabel(h.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={h.reviewed ? "" : "border-dashed"}>
                      {h.reviewed ? "✓ Reviewed" : "○ Needs review"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <HolidayActions holiday={h} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
