import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { getMyPayslip, getMyPayslipsForYear, logSelf } from "@/lib/payroll/mine";
import { isMonthKey } from "@/lib/payroll/period";
import { buildPayslipsPdf } from "@/lib/payroll/pdf";
import { logError } from "@/lib/timesheet/log";

// Download your own payslip as a PDF: ?month=2026-11 for one month, or ?year=2026 for the whole year.
// There is no way to name another person: the owner always comes from the signed-in session, the files come from the
// stored snapshot, and nothing salary-related is ever put in the address or in the file name. The response is never cached.
export const dynamic = "force-dynamic";

const plain = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return plain(401, "Sign in to download your payslip.");

  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  const yearText = params.get("year");

  try {
    let slips;
    let name: string;
    if (month) {
      if (!isMonthKey(month)) return plain(400, "That month isn't valid.");
      const slip = await getMyPayslip(month);
      if (!slip) return plain(404, "There is no payslip for that month.");
      slips = [slip];
      name = `payslip-${month}.pdf`;
      await logSelf("downloaded_payslip", slip.id);
    } else if (yearText && /^\d{4}$/.test(yearText)) {
      slips = await getMyPayslipsForYear(Number(yearText));
      if (slips.length === 0) return plain(404, "There are no payslips for that year.");
      name = `payslips-${yearText}.pdf`;
      await logSelf("downloaded_year", null);
    } else {
      return plain(400, "Choose a month or a year.");
    }

    const bytes = await buildPayslipsPdf(slips, `Payslip ${month ?? yearText}`);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    logError("salary-pdf", e); // the error name and code only, never a figure
    return plain(500, "Couldn't create the PDF. Please try again.");
  }
}
