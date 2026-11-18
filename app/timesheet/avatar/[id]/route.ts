import { NextResponse, type NextRequest } from "next/server";
import { AVATAR_BUCKET, avatarPath, isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";

// Profile pictures are not public: this route checks that somebody is signed in (and still allowed in), then
// streams the file out of the private bucket. A person without a picture gets a 404, and the page shows initials.
const HEADERS = {
  "Cache-Control": "private, max-age=300",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404, headers: HEADERS });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } });

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).download(avatarPath(id));
  if (error || !data) return new NextResponse(null, { status: 404, headers: HEADERS });

  return new NextResponse(data, { headers: { ...HEADERS, "Content-Type": "image/webp" } });
}
