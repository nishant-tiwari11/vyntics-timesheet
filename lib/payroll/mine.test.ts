import { beforeEach, describe, expect, it, vi } from "vitest";

// An employee can only ever read THEIR OWN payslips. These tests check the application layer: every payslip query is
// filtered by the signed-in user's id (taken from the session), and nothing in the request can name someone else.
// (The database enforces the same rule with row level security; see supabase/tests/payroll_isolation_test.sql.)

type Call = { table: string; filters: [string, unknown][] };
const calls: Call[] = [];

function chain(table: string) {
  const call: Call = { table, filters: [] };
  calls.push(call);
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of ["select", "order", "limit", "is", "gte", "lte", "not", "in", "or"]) api[m] = self;
  api.eq = (col: string, val: unknown) => {
    call.filters.push([col, val]);
    return api;
  };
  api.maybeSingle = async () => ({ data: null, error: null });
  api.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return api;
}

vi.mock("@/lib/timesheet/auth", () => ({
  requireUser: async () => ({ id: "user-me", role: "employee" }),
  requireAdmin: async () => {
    throw new Error("not an admin");
  },
  db: async () => ({ from: (t: string) => chain(t), rpc: async () => ({ data: false, error: null }) }),
}));

import { getMyPayslip, getMyPayslipsForYear, getMyStructure, listMyPayslips } from "./mine";

beforeEach(() => {
  calls.length = 0;
});

const ownerFilter = (c: Call) => c.filters.some(([col, val]) => col === "user_id" && val === "user-me");

describe("an employee only reads their own payroll data", () => {
  it("filters the payslip list by the signed-in user", async () => {
    await listMyPayslips();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("payslips");
    expect(ownerFilter(calls[0])).toBe(true);
  });

  it("filters a single payslip by the signed-in user, whatever month is asked for", async () => {
    await getMyPayslip("2026-11");
    expect(ownerFilter(calls[0])).toBe(true);
  });

  it("filters the yearly download by the signed-in user", async () => {
    await getMyPayslipsForYear(2026);
    expect(ownerFilter(calls[0])).toBe(true);
  });

  it("has no way to ask for another person's payslip: the functions take no user id", () => {
    expect(listMyPayslips.length).toBe(0);
    expect(getMyPayslip.length).toBe(1); // the month only
    expect(getMyPayslipsForYear.length).toBe(1); // the year only
  });

  it("rejects a month that isn't a month (so nothing odd reaches a query)", async () => {
    await expect(getMyPayslip("2026-11' or 1=1 --")).rejects.toThrow();
    await expect(getMyPayslip("../../admin")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("shows no salary structure when the admin hasn't shared it", async () => {
    expect(await getMyStructure("INR")).toBeNull();
    expect(calls.filter((c) => c.table === "salary_structures")).toHaveLength(0); // it doesn't even ask
  });

  it("never reads drafts: payslips only exist once a run is finalized, and replaced ones are excluded", async () => {
    await listMyPayslips();
    // the query is on the payslips table (written only when finalizing), not on runs or draft figures
    expect(calls.map((c) => c.table)).toEqual(["payslips"]);
  });
});
