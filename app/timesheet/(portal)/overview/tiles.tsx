import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { listMyClaims } from "@/lib/expenses/server";
import { STATUS_LABEL } from "@/lib/expenses/types";
import { formatMoney } from "@/lib/payroll/money";
import { salaryPinState } from "@/lib/payroll/pin";
import { listMyPayslips } from "@/lib/payroll/mine";
import { myBalance } from "@/lib/timesheet/compOff";
import { daysText } from "@/lib/timesheet/compOffCore";
import { formatRange, formatYmd, todayInOffice } from "@/lib/timesheet/dates";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { listRequests } from "@/lib/timesheet/requests";
import { Skeleton } from "../../_components/Skeleton";
import "../dashboard/dashboard.css";

// The tiles of My Overview. Each one loads on its own, so a problem in one never hides the others. Salary amounts follow the
// salary PIN: while it is locked the amounts are not even read.

const REQUEST_STATUS = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;
const day = (d: string) => formatYmd(d, { day: "numeric", month: "short" });

function Head({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="ts-tile-head">
      <h2 className="ts-tile-title">{title}</h2>
      <Link href={href} className="ts-tile-arrow" aria-label={label}>
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Failed({ title, href }: { title: string; href: string }) {
  return (
    <section className="ts-tile ts-t-half">
      <Head title={title} href={href} label={`Open ${title}`} />
      <p className="ts-alert" role="alert">
        Couldn&apos;t load this. Please try again.
      </p>
    </section>
  );
}

function fail(name: string, e: unknown) {
  if (!(e instanceof TimesheetError)) logError(name, e);
}

export function TileSkeleton() {
  return (
    <div className="ts-tile ts-t-half" aria-busy="true">
      <Skeleton height={150} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="ts-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ---------------------------- Leave and work from home ----------------------------

export async function LeaveTile() {
  let rows;
  try {
    rows = await listRequests();
  } catch (e) {
    fail("overview-leave", e);
    return <Failed title="Leave & WFH" href="/timesheet/leave" />;
  }
  const today = todayInOffice();
  const live = rows.filter((r) => r.status !== "cancelled");
  const pending = live.filter((r) => r.status === "pending").length;
  const coming = live
    .filter((r) => r.status === "approved" && r.to_date >= today)
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  const recent = [...live].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

  return (
    <section className="ts-tile ts-t-half" aria-label="Leave and WFH">
      <Head title="Leave & WFH" href="/timesheet/leave" label="Open Leave and WFH" />
      <dl className="ts-facts">
        <Fact label="Waiting for approval" value={String(pending)} />
        <Fact label="Approved, coming up" value={String(coming.length)} />
        <Fact label="Next day off" value={coming[0] ? day(coming[0].from_date > today ? coming[0].from_date : today) : "None"} />
      </dl>
      {recent.length === 0 ? (
        <p className="ts-muted ts-tile-empty">No requests yet. Apply from the Leave &amp; WFH page.</p>
      ) : (
        <ul className="ts-mini-list">
          {recent.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.comp_off ? "Comp-off" : r.type === "leave" ? "Leave" : "Work from home"}</strong>
                <span className="ts-muted">{formatRange(r.from_date, r.to_date)}</span>
              </span>
              <span className={`ts-chip ts-chip-${r.status}`}>{REQUEST_STATUS[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------- Comp-off ----------------------------

export async function CompOffTile() {
  let b;
  try {
    b = await myBalance();
  } catch (e) {
    fail("overview-compoff", e);
    return <Failed title="Comp-off" href="/timesheet/leave#comp-off" />;
  }
  return (
    <section className="ts-tile ts-t-half" aria-label="Comp-off">
      <Head title="Comp-off" href="/timesheet/leave#comp-off" label="Open Comp-off" />
      <p className={`ts-tile-big${b.balance < 0 ? " is-negative" : ""}`}>{daysText(b.balance)}</p>
      <p className="ts-muted ts-tile-sub">Your balance right now</p>
      <dl className="ts-facts">
        <Fact label="Earned" value={daysText(b.earned)} />
        <Fact label="Used" value={daysText(b.used)} />
        <Fact label="Expiring in 14 days" value={daysText(b.expiringSoon)} />
      </dl>
      {b.earned === 0 && b.used === 0 && <p className="ts-muted ts-tile-empty">Work on a weekly off day or a holiday to earn a comp-off day.</p>}
    </section>
  );
}

// ---------------------------- Expenses ----------------------------

export async function ExpensesTile() {
  let claims;
  try {
    claims = await listMyClaims();
  } catch (e) {
    fail("overview-expenses", e);
    return <Failed title="Expenses" href="/timesheet/expenses" />;
  }
  const pending = claims.filter((c) => c.status === "pending").length;
  const waiting = claims.filter((c) => c.status === "approved" || c.status === "added_to_payroll").reduce((n, c) => n + (c.approved ?? 0), 0);
  const paid = claims.filter((c) => c.status === "reimbursed").reduce((n, c) => n + (c.approved ?? 0), 0);
  const recent = claims.slice(0, 3);

  return (
    <section className="ts-tile ts-t-half" aria-label="Expenses">
      <Head title="Expenses" href="/timesheet/expenses" label="Open Expenses" />
      <dl className="ts-facts">
        <Fact label="Waiting for approval" value={String(pending)} />
        <Fact label="To be paid with salary" value={formatMoney(waiting)} />
        <Fact label="Reimbursed" value={formatMoney(paid)} />
      </dl>
      {recent.length === 0 ? (
        <p className="ts-muted ts-tile-empty">No claims yet. Use Add new expense on the Expenses page.</p>
      ) : (
        <ul className="ts-mini-list">
          {recent.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.category}</strong>
                <span className="ts-muted">
                  {c.code} · {day(c.date)}
                </span>
              </span>
              <span className="ts-tile-amount">
                {formatMoney(c.claimed)}
                <span className="ts-muted">{STATUS_LABEL[c.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------- Salary ----------------------------

export async function SalaryTile() {
  let slips;
  let open = false;
  try {
    slips = await listMyPayslips();
    open = (await salaryPinState().catch(() => "none")) === "open";
  } catch (e) {
    fail("overview-salary", e);
    return <Failed title="My Salary" href="/timesheet/salary" />;
  }
  const latest = slips[0];
  const month = latest ? formatYmd(`${latest.month}-01`, { month: "long", year: "numeric" }) : "";

  return (
    <section className="ts-tile ts-t-half" aria-label="My Salary">
      <Head title="My Salary" href="/timesheet/salary" label="Open My Salary" />
      {!latest ? (
        <p className="ts-muted ts-tile-empty">Your first payslip appears here after payroll is finalized.</p>
      ) : (
        <>
          <p className="ts-tile-sub ts-muted">Latest payslip, {month}</p>
          <p className="ts-tile-big">{open ? formatMoney(latest.net, latest.currency) : "••••••"}</p>
          <p className="ts-muted ts-tile-sub">Net pay</p>
          <dl className="ts-facts">
            <Fact label="Payable days" value={String(latest.payableDays)} />
            <Fact label="Loss of pay days" value={String(latest.lopDays)} />
            <Fact label="Status" value={latest.status === "paid" ? "Paid" : "Finalized"} />
          </dl>
          {!open && (
            <p className="ts-tile-lock">
              <Lock className="size-3.5" aria-hidden="true" /> Amounts are hidden. Open My Salary and enter your salary PIN to see them.
            </p>
          )}
        </>
      )}
    </section>
  );
}
