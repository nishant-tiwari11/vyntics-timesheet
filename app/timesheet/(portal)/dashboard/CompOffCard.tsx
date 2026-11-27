import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayWord } from "@/lib/timesheet/leaveCore";
import { myBalance } from "@/lib/timesheet/compOff";
import { daysText, type CompOffBalance } from "@/lib/timesheet/compOffCore";
import { formatYmd } from "@/lib/timesheet/dates";
import { logError } from "@/lib/timesheet/log";
import { SectionError } from "./sections";

// Your comp-off at a glance. Loads on its own, so a failure here never affects the rest of the dashboard.
export default async function CompOffCard({ legacy = false }: { /** The plain card, for the admin dashboard. */ legacy?: boolean }) {
  let balance: CompOffBalance | null = null;
  let error: string | null = null;
  try {
    balance = await myBalance();
  } catch (e) {
    logError("comp-off-card", e);
    error = "Couldn't load your comp-off. Please try again.";
  }

  return (
    <section className={legacy ? "ts-card" : "ts-tile ts-t-comp"} aria-labelledby="comp-off-card-title">
      <div className="ts-section-head">
        <h2 className={legacy ? "ts-h2" : "ts-tile-title"} id="comp-off-card-title">
          Comp-off
        </h2>
        <Button asChild variant="outline" className="max-md:min-h-11">
          <Link href="/timesheet/leave#comp-off">
            <Sparkles aria-hidden="true" /> Earn or use comp-off
          </Link>
        </Button>
      </div>
      {error || !balance ? (
        <SectionError message={error ?? "Couldn't load your comp-off."} />
      ) : balance.balance === 0 && balance.expiringSoon === 0 && balance.earned === 0 ? (
        <div className="ts-empty">
          <strong>No comp-off days yet</strong>
          <p>Work on a weekly off day or a holiday and you can earn one to use later.</p>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-sm text-muted-foreground">Balance</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${balance.balance < 0 ? "text-destructive" : ""}`}>{dayWord(balance.balance)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Next to expire</dt>
            {balance.nextExpiry ? (
              <>
                <dd className="text-2xl font-semibold tabular-nums">{formatYmd(balance.nextExpiry.date, { day: "numeric", month: "short", year: "numeric" })}</dd>
                <dd className="text-sm text-muted-foreground">{daysText(balance.nextExpiry.days)} expire{balance.nextExpiry.days === 1 ? "s" : ""} then</dd>
              </>
            ) : (
              <dd className="text-2xl font-semibold">None</dd>
            )}
          </div>
        </dl>
      )}
    </section>
  );
}
