import { NextResponse } from "next/server";
import { AVATAR_BUCKET, avatarPath } from "@/lib/avatar";
import { profileCompletion, requiredChecklist } from "@/lib/documents/config";
import { listDocuments } from "@/lib/documents/server";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export type CompletionInfo = { percent: number; hasPhoto: boolean; hasName: boolean; docsDone: number; docsTotal: number };

// GET /api/profile/completion → how complete the signed-in person's own profile is: photo, name, required documents.
// Only ever about yourself. Used by the first-visit "Complete your profile" pop-up.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401, headers: HEADERS });
  try {
    const supabase = await createClient();
    const [profile, photo, docs] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", me.id).maybeSingle(),
      supabase.storage.from(AVATAR_BUCKET).list("", { limit: 1, search: avatarPath(me.id) }),
      listDocuments(me.id).catch(() => ({ ready: false as const })),
    ]);
    const hasPhoto = (photo.data ?? []).some((f) => f.name === avatarPath(me.id));
    const hasName = !!profile.data?.full_name?.trim();
    const list = requiredChecklist(docs.ready ? docs.current.map((d) => ({ category: d.category, status: d.status })) : []);
    const done = profileCompletion({ hasPhoto, hasName, docsDone: list.done, docsTotal: list.total });
    const info: CompletionInfo = { percent: done.percent, hasPhoto, hasName, docsDone: list.done, docsTotal: list.total };
    return NextResponse.json({ ok: true, ...info }, { headers: HEADERS });
  } catch (e) {
    logError("profile completion", e);
    return NextResponse.json({ ok: false }, { status: 500, headers: HEADERS });
  }
}
