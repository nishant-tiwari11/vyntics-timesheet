import "server-only";
import { db, requireAdmin, requireUser } from "./auth";
import { TimesheetError, assertDate, assertId, toError } from "./errors";
import { HOLIDAY_TYPES, isDayOff, type Holiday, type HolidayInput, type HolidayType } from "./holidayTypes";
import { isYmd } from "./dates";

type Row = {
  id: string;
  name: string;
  holiday_date: string;
  type: string;
  description: string | null;
  year: number;
  reviewed: boolean;
};

const toHoliday = (r: Row): Holiday => ({
  id: r.id,
  name: r.name,
  date: r.holiday_date,
  type: r.type as HolidayType,
  description: r.description ?? "",
  year: r.year,
  reviewed: r.reviewed,
});

const isType = (v: unknown): v is HolidayType => HOLIDAY_TYPES.some((t) => t.id === v);

// ---------------------------- Reading (everyone signed in) ----------------------------

export async function listHolidays(opts: { year?: number; type?: HolidayType } = {}): Promise<Holiday[]> {
  await requireUser();
  const supabase = await db();
  let query = supabase.from("holidays").select("*").order("holiday_date", { ascending: true }).limit(500);
  if (opts.year) query = query.eq("year", opts.year);
  if (opts.type) query = query.eq("type", opts.type);
  const { data, error } = await query;
  if (error) throw toError(error, "Couldn't load holidays. Please try again.");
  return data.map(toHoliday);
}

export async function listHolidaysBetween(from: string, to: string): Promise<Holiday[]> {
  assertDate(from, "start date");
  assertDate(to, "end date");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .gte("holiday_date", from)
    .lte("holiday_date", to)
    .order("holiday_date", { ascending: true })
    .limit(500);
  if (error) throw toError(error, "Couldn't load holidays. Please try again.");
  return data.map(toHoliday);
}

/** The next few holidays from a date on (that date included). */
export async function upcomingHolidays(from: string, limit = 5): Promise<Holiday[]> {
  assertDate(from, "date");
  await requireUser();
  const supabase = await db();
  const { data, error } = await supabase
    .from("holidays")
    .select("*")
    .gte("holiday_date", from)
    .order("holiday_date", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 20));
  if (error) throw toError(error, "Couldn't load holidays. Please try again.");
  return data.map(toHoliday);
}

/** Dates in a range that are not working days (public holidays and festivals). */
export async function offDatesBetween(from: string, to: string): Promise<string[]> {
  const list = await listHolidaysBetween(from, to);
  return list.filter((h) => isDayOff(h.type)).map((h) => h.date);
}

// ---------------------------- Changing (admins only; row level security checks again) ----------------------------

function clean(input: HolidayInput) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new TimesheetError("Enter the holiday's name.");
  if (name.length > 120) throw new TimesheetError("Keep the name to 120 characters or fewer.");
  const date = assertDate(input.date, "date");
  if (!isType(input.type)) throw new TimesheetError("Choose Public holiday, Festival or Optional.");
  const description = String(input.description ?? "").trim();
  if (description.length > 500) throw new TimesheetError("Keep the description to 500 characters or fewer.");
  return { name, holiday_date: date, type: input.type, description: description || null };
}

const DUPLICATE = "There is already a holiday on that date. Edit it instead.";

export async function createHoliday(input: HolidayInput): Promise<void> {
  const row = clean(input);
  const admin = await requireAdmin();
  const supabase = await db();
  // An admin typing a holiday in has checked it, so it starts as reviewed.
  const { error } = await supabase.from("holidays").insert({ ...row, reviewed: true, created_by: admin.id });
  if (error) {
    if (error.code === "23505") throw new TimesheetError(DUPLICATE);
    throw toError(error, "Couldn't save the holiday. Please try again.");
  }
}

export async function updateHoliday(id: string, input: HolidayInput): Promise<void> {
  assertId(id, "holiday");
  const row = clean(input);
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("holidays").update({ ...row, reviewed: true }).eq("id", id).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") throw new TimesheetError(DUPLICATE);
    throw toError(error, "Couldn't save the holiday. Please try again.");
  }
  if (!data) throw new TimesheetError("That holiday no longer exists. Please refresh.");
}

export async function deleteHoliday(id: string): Promise<void> {
  assertId(id, "holiday");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("holidays").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw toError(error, "Couldn't delete the holiday. Please try again.");
  if (!data) throw new TimesheetError("That holiday no longer exists. Please refresh.");
}

/** Mark every holiday of a year as checked against the official list. */
export async function markYearReviewed(year: number): Promise<number> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TimesheetError("Choose a valid year.");
  await requireAdmin();
  const supabase = await db();
  const { data, error } = await supabase.from("holidays").update({ reviewed: true }).eq("year", year).eq("reviewed", false).select("id");
  if (error) throw toError(error, "Couldn't update the holidays. Please try again.");
  return data.length;
}

// ---------------------------- CSV import ----------------------------

/** Split one CSV line, with "quoted, values" and "" for a quote inside quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** 2026-10-20, 20/10/2026 or 20-10-2026 → 2026-10-20 (or null). */
function normalizeDate(text: string): string | null {
  if (isYmd(text)) return text;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!m) return null;
  const ymd = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isYmd(ymd) ? ymd : null;
}

export type ImportResult = { added: number; skipped: { line: number; reason: string }[] };

/**
 * Import holidays from CSV text: columns date, name, type (public/optional/festival), description (optional).
 * A header row is allowed. Rows with a problem, or on a date that already has a holiday, are skipped and listed.
 */
export async function importHolidays(csv: string): Promise<ImportResult> {
  await requireAdmin();
  const text = String(csv ?? "");
  if (text.length > 200_000) throw new TimesheetError("That file is too large. Keep it under 200 KB.");

  const lines = text.split(/\r?\n/);
  const skipped: ImportResult["skipped"] = [];
  const rows: { line: number; name: string; holiday_date: string; type: HolidayType; description: string | null }[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = splitCsvLine(raw);
    if (i === 0 && /^date$/i.test(cells[0] ?? "")) return; // header
    const [d, name, type, description = ""] = cells;
    const date = normalizeDate(d ?? "");
    if (!date) return void skipped.push({ line, reason: "The date must look like 2026-10-20 or 20/10/2026." });
    if (!name) return void skipped.push({ line, reason: "The name is missing." });
    if (name.length > 120) return void skipped.push({ line, reason: "The name is longer than 120 characters." });
    const t = (type ?? "").toLowerCase();
    if (!isType(t)) return void skipped.push({ line, reason: "The type must be public, optional or festival." });
    if (description.length > 500) return void skipped.push({ line, reason: "The description is longer than 500 characters." });
    if (seen.has(date)) return void skipped.push({ line, reason: "This date appears twice in the file." });
    seen.add(date);
    rows.push({ line, name, holiday_date: date, type: t, description: description || null });
  });

  if (lines.length > 1000) throw new TimesheetError("Import up to 1000 rows at a time.");
  if (rows.length === 0) return { added: 0, skipped };

  const supabase = await db();
  const { data: existing, error: readError } = await supabase
    .from("holidays")
    .select("holiday_date")
    .in("holiday_date", rows.map((r) => r.holiday_date));
  if (readError) throw toError(readError, "Couldn't check existing holidays. Please try again.");
  const taken = new Set(existing.map((e) => e.holiday_date));

  const fresh = rows.filter((r) => {
    if (!taken.has(r.holiday_date)) return true;
    skipped.push({ line: r.line, reason: "There is already a holiday on this date." });
    return false;
  });
  if (fresh.length > 0) {
    const { error } = await supabase
      .from("holidays")
      .insert(fresh.map((r) => ({ name: r.name, holiday_date: r.holiday_date, type: r.type, description: r.description, reviewed: true })));
    if (error) throw toError(error, "Couldn't import the holidays. Please try again.");
  }
  skipped.sort((a, b) => a.line - b.line);
  return { added: fresh.length, skipped };
}
