"use client";

import { formatMoney } from "@/lib/payroll/money";
import type { PayslipListItem } from "@/lib/payroll/slipTypes";
import { useHidden } from "./AmountMask";

// Net pay over the last months as plain black bars (no chart library). While amounts are hidden the bars show only
// their shape: no numbers, no tooltips. A table of the same data sits right below it for screen readers.
export default function NetPayChart({ slips, currency }: { slips: PayslipListItem[]; currency: string }) {
  const hidden = useHidden();
  const data = [...slips].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.net), 1);
  const label = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  return (
    <figure className="grid gap-3">
      <div role="img" aria-label={hidden ? "Net pay by month. Amounts are hidden." : `Net pay for the last ${data.length} months`} className="flex h-40 items-end gap-2 border-b px-1">
        {data.map((d) => (
          <div key={d.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={hidden ? undefined : `${label(d.month)}: ${formatMoney(d.net, currency)}`}>
            <div className="w-full max-w-10 rounded-t bg-foreground transition-[height] duration-150" style={{ height: `${Math.max((d.net / max) * 100, 2)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-1 text-xs text-muted-foreground" aria-hidden="true">
        {data.map((d) => (
          <span key={d.id} className="min-w-0 flex-1 text-center">
            {label(d.month)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {hidden ? "Amounts are hidden." : data.map((d) => `${label(d.month)} ${d.month.slice(0, 4)}: ${formatMoney(d.net, currency)}`).join(". ")}
      </figcaption>
    </figure>
  );
}
