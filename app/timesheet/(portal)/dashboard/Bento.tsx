import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/access/config";
import { formatTodayLong, greeting, isWeekend, formatYmd } from "@/lib/timesheet/dates";
import { dailyTarget } from "@/lib/timesheet/settings";
import { Skeleton } from "../../_components/Skeleton";
import { UserAvatar } from "../../_components/UserAvatar";
import { AddLogButton } from "./LogDialog";
import { loadWeekStats } from "./data";
import { SectionError } from "./sections";

// The dashboard's top: a greeting with the week's numbers, then a grid of rounded tiles (you, your hours, today).
// Every tile reads the same cached week numbers, so this is one database call.

const fmtHours = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
/** 2.5 hours as "2:30". */
const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

type User = { id: string; name: string; role: Role };

// ---------------------------- Greeting and numbers ----------------------------

export function HeadSkeleton() {
  return (
    <div className="ts-dhead" aria-busy="true" aria-label="Loading your dashboard">
      <Skeleton height={44} />
      <Skeleton height={52} />
    </div>
  );
}

export async function Head({ user, today }: { user: User; today: string }) {
  const res = await loadWeekStats();
  const first = user.name.split(" ")[0];
  const target = dailyTarget();
  return (
    <div className="ts-dhead">
      <div className="ts-dhead-top">
        <div>
          <h1 className="ts-greeting">
            {greeting()}, <strong>{first}</strong>
          </h1>
          <p className="ts-muted">{formatTodayLong()}</p>
        </div>
        <AddLogButton today={today} />
      </div>

      {!res.ok ? (
        <SectionError message={res.error} />
      ) : (
        (() => {
          const { hours, target: weekTarget, met, under, elapsed, today: todayHours } = res.data;
          const weekPct = weekTarget > 0 ? Math.min(hours / weekTarget, 1) : 0;
          const dayPct = Math.min(todayHours / target, 1);
          return (
            <div className="ts-dstats">
              <div className="ts-dpills">
                <div className="ts-dpill ts-dpill-wide">
                  <span className="ts-dpill-label">Week target</span>
                  <span className="ts-dpill-bar is-striped" role="progressbar" aria-label="Week target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(weekPct * 100)}>
                    <span style={{ width: `${weekPct * 100}%` }} />
                    <em>{Math.round(weekPct * 100)}%</em>
                  </span>
                </div>
                <div className="ts-dpill">
                  <span className="ts-dpill-label">Today</span>
                  <span className="ts-dpill-bar is-solid" role="progressbar" aria-label="Today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(dayPct * 100)}>
                    <span style={{ width: `${dayPct * 100}%` }} />
                    <em>{Math.round(dayPct * 100)}%</em>
                  </span>
                </div>
              </div>

              <ul className="ts-dnums" aria-label="This week">
                <li>
                  <span className="ts-dnum-icon" aria-hidden="true">
                    <Clock className="size-5" />
                  </span>
                  <span className="ts-dnum-value">{fmtHours(hours)}</span>
                  <span className="ts-dnum-label">Logged</span>
                </li>
                <li>
                  <span className="ts-dnum-icon" aria-hidden="true">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <span className="ts-dnum-value">
                    {met}
                    <small>/{elapsed}</small>
                  </span>
                  <span className="ts-dnum-label">Days met</span>
                </li>
                <li>
                  <span className="ts-dnum-icon" aria-hidden="true">
                    <TriangleAlert className="size-5" />
                  </span>
                  <span className="ts-dnum-value">
                    {under}
                    <small>/{elapsed}</small>
                  </span>
                  <span className="ts-dnum-label">Under target</span>
                </li>
              </ul>
            </div>
          );
        })()
      )}
    </div>
  );
}

// ---------------------------- Tiles ----------------------------

export function TopTilesSkeleton() {
  return (
    <>
      <div className="ts-tile ts-t-profile" aria-busy="true">
        <Skeleton height={240} />
      </div>
      <div className="ts-tile ts-t-chart" aria-busy="true">
        <Skeleton height={240} />
      </div>
      <div className="ts-tile ts-t-today" aria-busy="true">
        <Skeleton height={240} />
      </div>
    </>
  );
}

/** The three tiles of the first row: you, your hours this week, and today. */
export async function TopTiles({ user, today }: { user: User; today: string }) {
  const res = await loadWeekStats();
  const target = dailyTarget();

  if (!res.ok) {
    return (
      <div className="ts-tile ts-t-error">
        <SectionError message={res.error} />
      </div>
    );
  }
  const { days, hours, target: weekTarget, today: todayHours } = res.data;

  // Bars are scaled so the daily target sits a little below the top.
  const top = Math.max(target * 1.25, ...days.map((d) => d.hours), 1);
  const ring = { r: 62, c: 2 * Math.PI * 62 };
  const pct = Math.min(todayHours / target, 1);
  const left = Math.max(target - todayHours, 0);

  return (
    <>
      {/* You */}
      <section className="ts-tile ts-t-profile" aria-label="You">
        <UserAvatar userId={user.id} name={user.name} className="ts-profile-img !size-full !rounded-none text-7xl" />
        <span className="ts-profile-shade" aria-hidden="true" />
        <div className="ts-profile-info">
          <strong>{user.name}</strong>
          <span>{ROLE_LABEL[user.role]}</span>
        </div>
        <Link href="/timesheet/profile" className="ts-profile-badge" aria-label="Open your profile">
          <b>{fmtHours(todayHours)}</b>
          <span>logged today</span>
        </Link>
      </section>

      {/* Hours each day of this week */}
      <section className="ts-tile ts-t-chart" aria-labelledby="chart-title">
        <div className="ts-tile-head">
          <h2 className="ts-tile-title" id="chart-title">
            Hours this week
          </h2>
          <Link href="/timesheet/worklog" className="ts-tile-arrow" aria-label="Open your work log">
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="ts-chart-big">
          {fmtHours(hours)} <span>of {fmtHours(weekTarget)} target</span>
        </p>
        <div className="ts-bars" role="img" aria-label={`Hours logged each day: ${days.map((d) => `${formatYmd(d.date, { weekday: "long" })} ${fmtHours(d.hours)}`).join(", ")}`}>
          <span className="ts-bars-line" style={{ bottom: `calc(22px + (100% - 48px) * ${target / top})` }} aria-hidden="true" />
          {days.map((d) => (
            <span key={d.date} className={`ts-bar${d.date === today ? " is-today" : ""}${isWeekend(d.date) ? " is-off" : ""}`} aria-hidden="true">
              <span className="ts-bar-track">
                {d.hours > 0 && <em className="ts-bar-tip">{fmtHours(d.hours)}</em>}
                <span className="ts-bar-fill" style={{ height: `${Math.max((d.hours / top) * 100, d.hours > 0 ? 3 : 0)}%` }} />
              </span>
              <span className="ts-bar-day">{formatYmd(d.date, { weekday: "short" }).slice(0, 1)}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Today */}
      <section className="ts-tile ts-t-today" aria-labelledby="today-title">
        <div className="ts-tile-head">
          <h2 className="ts-tile-title" id="today-title">
            Today
          </h2>
          <Link href={`/timesheet/worklog?view=day&date=${today}`} className="ts-tile-arrow" aria-label="Open today in your work log">
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="ts-ringbox">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r={ring.r} className="ts-ringbox-track" />
            <circle cx="80" cy="80" r={ring.r} className="ts-ringbox-fill" strokeDasharray={ring.c} strokeDashoffset={ring.c * (1 - pct)} transform="rotate(-90 80 80)" />
          </svg>
          <div className="ts-ringbox-text">
            <strong>{clock(todayHours)}</strong>
            <span>Logged today</span>
          </div>
        </div>
        <p className="ts-ringbox-note">
          {todayHours >= target ? "Today's target is reached." : isWeekend(today) ? "A weekly off day. Logging is optional." : `${fmtHours(left)} to reach today's ${fmtHours(target)}.`}
        </p>
      </section>
    </>
  );
}

export function WeekSkeleton() {
  return (
    <>
      <div className="ts-tile ts-t-week" aria-busy="true">
        <Skeleton height={140} />
      </div>
      <div className="ts-tile ts-tile-dark ts-t-up" aria-busy="true">
        <Skeleton height={140} />
      </div>
    </>
  );
}

export function CompSkeleton() {
  return (
    <div className="ts-tile ts-t-comp" aria-busy="true">
      <Skeleton height={60} />
    </div>
  );
}
