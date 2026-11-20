"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createServiceClient } from "@/lib/supabase/admin";
import { listEmployees } from "@/lib/timesheet/admin";
import { TimesheetError } from "@/lib/timesheet/errors";
import { logError } from "@/lib/timesheet/log";
import { adminExistingLogKeys, adminImportLogs } from "@/lib/timesheet/logs";
import { activeProjectNames } from "@/lib/timesheet/projectList";
import { todayInOffice } from "@/lib/timesheet/dates";
import { entryKey, parseImportRows, type ImportRow, type RowProblem } from "@/lib/timesheet/importModel";

// Admin only: add many time logs from an Excel sheet, including days that are already locked for employees.
// Two steps with the same file: "check" shows what would happen and saves nothing; "import" reads the file again on the server
// (nothing the browser says about the rows is trusted) and saves them together.

// Server actions accept about 1 MB, and 500 rows of text are far smaller than that.
const MAX_BYTES = 900 * 1024;

export type ImportCheck =
  | {
      ok: true;
      ready: number;
      duplicates: number;
      people: number;
      from: string;
      to: string;
      sample: ImportRow[];
      problemCount: number;
      problems: RowProblem[];
    }
  | { ok: false; error: string };

export type ImportDone = { ok: true; imported: number } | { ok: false; error: string };

/** A cell's value as plain data: formulas give their result, rich text its text, errors nothing. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result ?? null;
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    return null; // errors and anything else
  }
  return v;
}

async function loadFile(form: FormData): Promise<{ rows: ImportRow[]; problems: RowProblem[]; duplicates: number }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new TimesheetError("Choose an Excel file first.");
  if (file.size > MAX_BYTES) throw new TimesheetError("That file is too large. Keep it under 900 KB.");
  if (!/\.xlsx$/i.test(file.name)) throw new TimesheetError("Use an Excel file that ends in .xlsx.");
  const bytes = Buffer.from(await file.arrayBuffer());
  // An .xlsx file is a zip file: it starts with "PK".
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new TimesheetError("That doesn't look like an Excel (.xlsx) file.");

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new TimesheetError("Couldn't read that Excel file. Save it again as .xlsx and try again.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new TimesheetError("The file has no sheet.");
  const table: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value));
    table.push(cells);
  });

  const [employees, projects] = await Promise.all([listEmployees(), activeProjectNames()]);
  const parsed = parseImportRows(table, { employees, projects, today: todayInOffice() });
  if ("fatal" in parsed) throw new TimesheetError(parsed.fatal);

  // Entries that are already in the work log are left out, so uploading the same sheet twice adds nothing twice.
  let rows = parsed.rows;
  let duplicates = 0;
  if (rows.length > 0) {
    const dates = rows.map((r) => r.date).sort();
    const existing = new Set((await adminExistingLogKeys([...new Set(rows.map((r) => r.userId))], dates[0], dates[dates.length - 1])).map(entryKey));
    const fresh = rows.filter((r) => !existing.has(entryKey(r)));
    duplicates = rows.length - fresh.length;
    rows = fresh;
  }
  return { rows, problems: parsed.problems, duplicates };
}

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TimesheetError) return { ok: false, error: e.message };
  logError("import work logs", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function requireAdminUser() {
  const me = await getCurrentUser();
  if (!me) throw new TimesheetError("Please sign in again.");
  if (me.role !== "admin") throw new TimesheetError("Only admins can import time logs.");
  return me;
}

export async function checkImportAction(form: FormData): Promise<ImportCheck> {
  try {
    await requireAdminUser();
    const { rows, problems, duplicates } = await loadFile(form);
    const dates = rows.map((r) => r.date).sort();
    return {
      ok: true,
      ready: rows.length,
      duplicates,
      people: new Set(rows.map((r) => r.userId)).size,
      from: dates[0] ?? "",
      to: dates[dates.length - 1] ?? "",
      sample: rows.slice(0, 5),
      problemCount: problems.length,
      problems: problems.slice(0, 30),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function runImportAction(form: FormData): Promise<ImportDone> {
  try {
    const me = await requireAdminUser();
    const { rows } = await loadFile(form);
    if (rows.length === 0) throw new TimesheetError("There is nothing new to import.");
    const imported = await adminImportLogs(rows.map((r) => ({ userId: r.userId, input: { entry: r.text, logDate: r.date, start: r.start, end: r.end, project: r.project } })));

    // Write it to the audit log. This needs the server's own database key because ordinary sign-ins can't write there;
    // it is only reached after the admin check above, and a failure here never undoes the import.
    try {
      const file = form.get("file");
      const dates = rows.map((r) => r.date).sort();
      const { error } = await createServiceClient()
        .from("access_audit")
        .insert({
          actor_id: me.id,
          actor_email: me.email,
          action: "work_logs_imported",
          target: `${imported} time logs`,
          detail: `${file instanceof File ? file.name : "sheet"}: ${new Set(rows.map((r) => r.userId)).size} people, ${dates[0]} to ${dates[dates.length - 1]}`.slice(0, 300),
        });
      if (error) logError("import work logs: audit", error);
    } catch (e) {
      logError("import work logs: audit", e);
    }

    for (const path of ["/timesheet/worklog", "/timesheet/admin", "/timesheet/dashboard", "/timesheet/calendar", "/timesheet/events", "/timesheet/leave"]) revalidatePath(path);
    return { ok: true, imported };
  } catch (e) {
    return fail(e);
  }
}
