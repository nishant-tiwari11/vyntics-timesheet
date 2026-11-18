import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FILTER_STATUSES, STATUS_LABEL, claimCode, csvCell, isAdminFilter, monthLabel, payrollNote, type ClaimRow } from "@/lib/expenses/types";

const claim = (over: Partial<ClaimRow>) => ({ status: "approved" as const, payrollMonth: "2026-11", reimbursedOn: null, decisionNote: "", ...over });

describe("expense wording", () => {
  it("names a claim by its number", () => {
    expect(claimCode(12)).toBe("EXP-00012");
    expect(claimCode(123456)).toBe("EXP-123456");
  });

  it("labels the status flow the way people read it", () => {
    expect(STATUS_LABEL.approved).toBe("Approved: pending payroll");
    expect(Object.keys(STATUS_LABEL)).toEqual(["draft", "pending", "approved", "added_to_payroll", "reimbursed", "rejected"]);
  });

  it("tells an employee which salary an approved expense is paid with", () => {
    expect(monthLabel("2026-11")).toBe("Nov 2026");
    expect(payrollNote(claim({}))).toBe("Will be paid with Nov 2026 salary");
    expect(payrollNote(claim({ status: "added_to_payroll" }))).toContain("Nov 2026");
    expect(payrollNote(claim({ status: "reimbursed", reimbursedOn: "2026-12-01" }))).toBe("Paid with Nov 2026 salary, 2026-12-01");
    expect(payrollNote(claim({ status: "rejected", payrollMonth: null, decisionNote: "No receipt" }))).toBe("No receipt");
    expect(payrollNote(claim({ status: "pending", payrollMonth: null }))).toBe("Waiting for an admin to approve it");
  });
});

describe("admin filters", () => {
  it("'Pending payroll' means approved but not yet reimbursed", () => {
    expect(FILTER_STATUSES.pending_payroll).toEqual(["approved", "added_to_payroll"]);
    expect(FILTER_STATUSES.reimbursed).toEqual(["reimbursed"]);
    expect(FILTER_STATUSES.all).toBeNull();
  });

  it("only accepts the known filters", () => {
    expect(isAdminFilter("pending_payroll")).toBe(true);
    expect(isAdminFilter("reimbursed")).toBe(true);
    expect(isAdminFilter("drafts")).toBe(false);
    expect(isAdminFilter(undefined)).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });

  it("stops a spreadsheet from running a description as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
  });
});

// The rules that keep money safe live in the database, so check the migration still spells them out.
describe("expense migration", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/step23_expenses.sql"), "utf8");

  it("lets a claim sit in only one payroll run, and only while it is linked", () => {
    expect(sql).toMatch(/payroll_run_id uuid references public\.payroll_runs/);
    expect(sql).toMatch(/\(status in \('added_to_payroll', 'reimbursed'\)\) = \(payroll_run_id is not null\)/);
  });

  it("never approves more than was claimed or more than the category limit", () => {
    expect(sql).toMatch(/approved_paise <= claimed_paise/);
    expect(sql).toMatch(/p_amount > c\.claimed_paise/);
    expect(sql).toMatch(/p_amount > cat\.limit_paise/);
  });

  it("refuses a finalized month, and a locked (reimbursed) claim", () => {
    expect(sql).toMatch(/r\.status in \('finalized', 'paid'\)[\s\S]*already finalized/);
    expect(sql).toMatch(/This expense has been reimbursed, so it is locked/);
  });

  it("marks claims reimbursed when finalizing, and puts them back on reopen", () => {
    expect(sql).toMatch(/set status = 'reimbursed'[\s\S]*payroll_run_id = p_run and status = 'added_to_payroll'/);
    expect(sql).toMatch(/set status = 'added_to_payroll', reimbursed_on = null[\s\S]*status = 'reimbursed'/);
  });

  it("keeps an audit trail of every change", () => {
    expect(sql).toMatch(/create table if not exists public\.expense_events/);
    expect(sql).toMatch(/create trigger expense_claims_audit_upd/);
  });

  it("gives admins no direct write access to claims", () => {
    expect(sql).not.toMatch(/expense claims: admin write/);
    expect(sql).toMatch(/grant execute on function public\.expense_approve/);
  });
});
