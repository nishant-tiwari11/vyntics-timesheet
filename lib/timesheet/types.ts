import type { Tables } from "@/lib/supabase/types";

export type Person = { full_name: string | null; email: string };

export type Request = Tables<"requests">;
export type RequestWithPerson = Request & { owner: Person | null };

export type WorkLog = Tables<"work_logs">;
export type LogStatus = WorkLog["status"];
export type WorkLogWithPerson = WorkLog & { owner: Person | null };
