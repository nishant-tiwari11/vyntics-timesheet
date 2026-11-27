import { worksInPortal } from "@/lib/access/config";

// Duty: the shapes and small rules the server and the browser share. No server-only imports.

export type DutyLocation = "office" | "wfh";

export const LOCATION_LABEL: Record<DutyLocation, string> = { office: "Office", wfh: "Work from home" };

/** Where someone stands right now. */
export type DutyState = {
  onDuty: boolean;
  /** ISO time the current stretch began (when on duty). */
  since: string | null;
  location: DutyLocation | null;
  /** Seconds of today's finished stretches. The stretch in progress is added by the browser so the clock keeps moving. */
  todaySeconds: number;
  /**
   * The most recent day in the last week when this person went on duty and never went off, so the system closed it at midnight.
   * Used to remind that person (only) to add their time log.
   */
  forgotten?: { id: string; date: string; start: string; location: DutyLocation } | null;
};

export type DutySession = { start: string; end: string | null; location: DutyLocation; /** Closed by the system because they forgot to go off duty. */ auto: boolean; seconds: number };

/** One day, for the admin: the stretches, the duty hours, and what the person reported on their timesheet. */
export type DutyDay = { date: string; sessions: DutySession[]; dutySeconds: number; reportedHours: number };

/** Employees and managers go on duty. Admins (who run the place) and read-only viewers don't. */
export const dutyEligible = (role: string) => worksInPortal(role);

/** "1 h 20 m", "45 m", "0 m". */
export function durationText(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** Seconds as hours with two decimals (4500 gives 1.25), for comparing with the hours on a timesheet. */
export const toHours = (totalSeconds: number) => Math.round((totalSeconds / 3600) * 100) / 100;
