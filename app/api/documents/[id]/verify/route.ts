import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: { ok: boolean; error?: string }, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

// PATCH /api/documents/<id>/verify   { decision: "verified" | "rejected", reason?: string }
// Admins only. Rejecting needs a reason. The database function checks the role again, writes the audit entry and
// sends the employee a notification, all in one step.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return reply({ ok: false, error: "That document could not be found." }, 400);
  const me = await getCurrentUser();
  if (!me) return reply({ ok: false, error: "Please sign in again." }, 401);
  if (me.role !== "admin") return reply({ ok: false, error: "Only admins can do that." }, 403);

  const body = (await request.json().catch(() => null)) as { decision?: unknown; reason?: unknown } | null;
  const decision = body?.decision;
  if (decision !== "verified" && decision !== "rejected") return reply({ ok: false, error: "Choose verify or reject." }, 400);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (decision === "rejected" && reason.length < 3) return reply({ ok: false, error: "Give a reason for rejecting this document." }, 400);

  const supabase = await createClient();
  const { error } = await supabase.rpc("doc_review" as never, { p_id: id, p_decision: decision, p_reason: reason } as never);
  if (error) {
    logError("document review", error);
    return reply({ ok: false, error: error.code === "P0001" ? error.message : "Couldn't save the decision. Please try again." }, 400);
  }
  return reply({ ok: true });
}
