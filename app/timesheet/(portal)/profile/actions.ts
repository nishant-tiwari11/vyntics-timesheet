"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { AVATAR_BUCKET, AVATAR_SIZE, AVATAR_UPLOAD_MAX_BYTES, avatarPath, isUuid } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/supabase/getCurrentUser";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

export type AvatarResult = { ok: true; version: number } | { ok: false; error: string };

const fail = (error: string): AvatarResult => ({ ok: false, error });

/** Who may change this photo: yourself (unless you are a read-only viewer), or any person if you are an admin. */
async function allowed(targetId: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Your session has expired. Please sign in again." };
  const id = targetId === undefined || targetId === null || targetId === "" ? me.id : targetId;
  if (!isUuid(id)) return { ok: false, error: "That person could not be found." };
  if (id !== me.id && me.role !== "admin") return { ok: false, error: "Only admins can change someone else's photo." };
  if (id === me.id && me.role === "viewer") return { ok: false, error: "You have read-only access, so you can't change your photo." };
  return { ok: true, id };
}

function refresh() {
  revalidatePath("/timesheet", "layout");
}

/**
 * Save a profile picture. The browser sends the cropped square; here it is checked again (the real file type is read
 * from the bytes, not the name), turned the right way up, cut to 400x400 and saved as WebP. Metadata is dropped.
 */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarResult> {
  try {
    const who = await allowed(formData.get("userId"));
    if (!who.ok) return fail(who.error);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a photo first.");
    if (file.size > AVATAR_UPLOAD_MAX_BYTES) return fail("That photo is too large. Please choose a smaller one.");

    const input = Buffer.from(await file.arrayBuffer());
    let image: Buffer;
    try {
      const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
      if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) return fail("Use a JPG, PNG or WebP photo.");
      image = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return fail("That file isn't a readable photo. Use a JPG, PNG or WebP image.");
    }

    const supabase = await createClient();
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath(who.id), image, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "300",
    });
    if (error) {
      logError("avatar upload", error);
      return fail("Couldn't save the photo. Please try again.");
    }
    refresh();
    return { ok: true, version: Date.now() };
  } catch (e) {
    logError("avatar upload", e);
    return fail("Something went wrong. Please try again.");
  }
}

export async function removeAvatarAction(targetId?: string): Promise<AvatarResult> {
  try {
    const who = await allowed(targetId);
    if (!who.ok) return fail(who.error);
    const supabase = await createClient();
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(who.id)]);
    if (error) {
      logError("avatar remove", error);
      return fail("Couldn't remove the photo. Please try again.");
    }
    refresh();
    return { ok: true, version: Date.now() };
  } catch (e) {
    logError("avatar remove", e);
    return fail("Something went wrong. Please try again.");
  }
}
