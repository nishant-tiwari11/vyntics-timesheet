import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/timesheet/auth";
import { report as compOffReport } from "@/lib/timesheet/compOff";
import { addDays, todayInOffice } from "@/lib/timesheet/dates";
import { toError } from "@/lib/timesheet/errors";
import { listApprovedLeaveBetween } from "@/lib/timesheet/admin";
import { offDatesBetween } from "@/lib/timesheet/holidays";
import { displayName } from "@/lib/timesheet/people";
import {
  buildHoursTable,
  buildLeaveTable,
  buildUnderTargetTable,
  expectedWorkingDays,
  leaveDaysByPerson,
  type LogRow,
  type ReportQuery,
  type ReportTable,
} from "./reportsModel";

// The Admin reports, worked out from the same tables the rest of the portal uses (nothing new is stored). Admin only.

export type Person = { id: string; name: string };
export type ReportResult = { table: ReportTable; /** More rows existed than could be read; the numbers are for the first part. */ truncated: boolean };

const PAGE = 1000;
const MAX_PAGES = 20;

type ProfileRow = { id: string; full_name: string | null; email: string; role: string; status?: string };

async function loadProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email, role, status").limit(5000);
  if (error) throw toError(error, "Couldn't load the people. Please try again.");
  return data as ProfileRow[];
}

/** Everyone who can be chosen in a report, A to Z. */
export async function loadReportPeople(): Promise<Person[]> {
  await requireAdmin();
  return (await loadProfiles())
    .filter((p) => p.role !== "viewer" && p.status !== "disabled")
    .map((p) => ({ id: p.id, name: displayName(p) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchLogs(q: ReportQuery, opts: { project: boolean }) {
  const supabase = await createClient();
  const rows: { user_id: string; log_date: string; hours: number | null; project: string | null; status: string }[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase.from("work_logs").select("user_id, log_date, hours, project, status").gte("log_date", q.from).lte("log_date", q.to);
    if (q.employee !== "all") query = query.eq("user_id", q.employee);
    if (opts.project && q.project !== "all") query = query.eq("project", q.project);
    const { data, error } = await query.order("log_date").order("id").range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw toError(error, "Couldn't load time logs. Please try again.");
    rows.push(...data);
    if (data.length < PAGE) return { rows, truncated };
  }
  truncated = true;
  return { rows, truncated };
}

export async function loadReport(q: ReportQuery): Promise<ReportResult> {
  await requireAdmin();
  const today = todayInOffice();
  const profiles = await loadProfiles();
  const nameOf = new Map(profiles.map((p) => [p.id, displayName(p)]));
  const eligible = profiles
    .filter((p) => p.role !== "viewer" && p.status !== "disabled" && (q.employee === "all" || p.id === q.employee))
    .map((p) => ({ id: p.id, name: displayName(p) }));

  if (q.report === "hours") {
    const { rows, truncated } = await fetchLogs(q, { project: true });
    const logs: LogRow[] = rows.map((r) => ({
      userId: r.user_id,
      name: nameOf.get(r.user_id) ?? "Former employee",
      date: r.log_date,
      project: r.project ?? "",
      hours: r.hours ?? 0,
      status: r.status,
    }));
    return { table: buildHoursTable(logs, q.group), truncated };
  }

  if (q.report === "under") {
    const [{ rows, truncated }, off, leave] = await Promise.all([
      fetchLogs(q, { project: false }),
      offDatesBetween(q.from, q.to).catch(() => [] as string[]),
      listApprovedLeaveBetween(q.from, q.to).catch(() => []),
    ]);
    const hoursById = new Map<string, number>();
    for (const r of rows) if (r.status !== "rejected") hoursById.set(r.user_id, (hoursById.get(r.user_id) ?? 0) + (r.hours ?? 0));
    const leaveById = new Map<string, Set<string>>();
    for (const l of leave) {
      const set = leaveById.get(l.user_id) ?? new Set<string>();
      for (let d = l.from_date; d <= l.to_date && d <= q.to; d = addDays(d, 1)) set.add(d);
      leaveById.set(l.user_id, set);
    }
    const offDays = new Set(off);
    const workingDaysById = new Map(eligible.map((p) => [p.id, expectedWorkingDays({ from: q.from, to: q.to, today, offDays, leaveDays: leaveById.get(p.id) ?? new Set() })]));
    return { table: buildUnderTargetTable({ people: eligible, hoursById, workingDaysById }), truncated };
  }

  // leave
  const supabase = await createClient();
  let query = supabase.from("requests").select("user_id, type, comp_off, from_date, to_date").eq("status", "approved").lte("from_date", q.to).gte("to_date", q.from).limit(5000);
  if (q.employee !== "all") query = query.eq("user_id", q.employee);
  const [requests, off, compOff] = await Promise.all([query, offDatesBetween(q.from, q.to).catch(() => [] as string[]), compOffReport().catch(() => [])]);
  if (requests.error) throw toError(requests.error, "Couldn't load leave. Please try again.");
  const days = leaveDaysByPerson(
    requests.data.map((r) => ({ userId: r.user_id, type: r.type, compOff: !!(r as { comp_off?: boolean }).comp_off, from: r.from_date, to: r.to_date })),
    { from: q.from, to: q.to },
    off
  );
  const balances = new Map(compOff.map((c) => [c.userId, { earned: c.earned, used: c.used, available: c.available }]));
  return { table: buildLeaveTable({ people: eligible, days, compOff: balances }), truncated: requests.data.length >= 5000 };
}

// ---------------------------- Excel ----------------------------

const HEADER_FILL = "FFFFF2A8";
const BORDER = { style: "thin", color: { argb: "FFBFBFBF" } } as const;

/** The table as an Excel workbook: bold highlighted header that stays in view, filters, numbers as numbers, a bold totals row. */
export async function tableToXlsx(table: ReportTable, subtitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vyntics timesheet";
  const ws = wb.addWorksheet(table.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 3 }] });

  ws.addRow([table.title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { color: { argb: "FF666666" } };
  const header = ws.addRow(table.columns.map((c) => c.label));
  header.height = 22;
  header.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: table.columns[i - 1].numeric ? "right" : "left" };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  });
  ws.columns = table.columns.map((c, i) => ({ key: c.key, width: Math.max(c.label.length + 4, i === 0 ? 26 : 14) }));

  const put = (row: Record<string, string | number>, bold = false) => {
    // Text is stored as text, so a name that starts with "=" can never run as a formula.
    const r = ws.addRow(table.columns.map((c) => row[c.key] ?? ""));
    table.columns.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.numeric && typeof cell.value === "number") cell.numFmt = "0.00";
      if (c.numeric) cell.alignment = { horizontal: "right" };
    });
    if (bold) r.font = { bold: true };
  };
  for (const row of table.rows) put(row);
  if (table.totals) put(table.totals, true);

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: table.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
