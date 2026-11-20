import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { todayInOffice, addDays } from "@/lib/timesheet/dates";
import { activeProjectNames } from "@/lib/timesheet/projectList";

// A blank Excel sheet with the columns the importer reads, one example row and a list of the projects. Admin only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (user.role !== "admin") return new Response("Only admins can import time logs.", { status: 403 });

  const projects = await activeProjectNames().catch(() => [] as string[]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vyntics timesheet";
  const ws = wb.addWorksheet("Work log", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Employee", key: "person", width: 26 },
    { header: "Date", key: "date", width: 13 },
    { header: "Project", key: "project", width: 18 },
    { header: "Start", key: "start", width: 9 },
    { header: "End", key: "end", width: 9 },
    { header: "Description", key: "text", width: 60, style: { alignment: { wrapText: true, vertical: "top" } } },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2A8" } };
  });
  ws.addRow({
    person: "Full name or work email",
    date: addDays(todayInOffice(), -7),
    project: projects[0] ?? "Project name",
    start: "09:00",
    end: "13:00",
    text: "What the person worked on (replace this example row)",
  });

  const list = wb.addWorksheet("Projects");
  list.getColumn(1).width = 28;
  list.addRow(["Active projects (use these names exactly)"]).font = { bold: true };
  for (const p of projects) list.addRow([p]);

  return new Response(new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer())), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="work-log-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
