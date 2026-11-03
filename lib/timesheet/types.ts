import type { Tables } from "@/lib/supabase/types";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = Record<DayKey, number>;

export type Week = Tables<"timesheet_weeks">;
export type WeekRow = Tables<"timesheet_rows">;
export type WeekWithRows = Week & { timesheet_rows: WeekRow[] };

export type Person = { full_name: string | null; email: string };

export type Request = Tables<"requests">;
export type RequestWithPerson = Request & { owner: Person | null };
export type WeekWithPerson = WeekWithRows & { owner: Person | null };

export type WorkLog = Tables<"work_logs">;
export type WorkLogWithPerson = WorkLog & { owner: Person | null };
