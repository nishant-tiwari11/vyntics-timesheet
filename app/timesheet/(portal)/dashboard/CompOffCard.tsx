import Link from "next/link";
import { dayWord } from "@/lib/timesheet/leaveCore";
import { myBalance } from "@/lib/timesheet/compOff";
import { daysText, type CompOffBalance } from "@/lib/timesheet/compOffCore";
import { logError } from "@/lib/timesheet/log";
import { SectionError } from "./sections";

// Your comp-off at a glance. Loads on its own, so a failure here never affects the rest of the dashboard.
export default async function CompOffCard() {
  let balance: CompOffBalance | null = null;
  let error: string | null = null;
  try {
    balance = await myBalance();
  } catch (e) {
    logError("comp-off-card", e);
    error = "Couldn't load your comp-off. Please try again.";
  }

  return (
    <section className="ts-card" aria-labelledby="comp-off-card-title">
      <div className="ts-section-head">
        <h2 className="ts-h2" id="comp-off-card-title">
          Comp-off
        </h2>
        <Link href="/timesheet/leave#comp-off" className="ts-link">
          Earn or use
        </Link>
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
            <dt className="text-sm text-muted-foreground">Expiring in 14 days</dt>
            <dd className="text-2xl font-semibold tabular-nums">{daysText(balance.expiringSoon)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
