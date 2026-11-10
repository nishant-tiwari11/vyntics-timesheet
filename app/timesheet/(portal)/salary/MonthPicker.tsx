"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Choose a year and a month to open any past payslip. Only the month ("2026-11") goes into the address.
export default function MonthPicker({ months, current }: { months: string[]; current: string }) {
  const router = useRouter();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const year = current.slice(0, 4);
  const inYear = months.filter((m) => m.startsWith(year));
  const label = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const go = (month: string) => router.push(`/timesheet/salary?month=${month}`);

  return (
    <div className="flex flex-wrap items-end gap-3 no-print">
      <div className="grid gap-1.5">
        <Label htmlFor="sal-year">Year</Label>
        <Select value={year} onValueChange={(y) => go(months.find((m) => m.startsWith(y)) ?? current)}>
          <SelectTrigger id="sal-year" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sal-month">Month</Label>
        <Select value={current} onValueChange={go}>
          <SelectTrigger id="sal-month" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inYear.map((m) => (
              <SelectItem key={m} value={m}>
                {label(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
