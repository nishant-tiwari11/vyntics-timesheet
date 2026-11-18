import "server-only";
import sharp from "sharp";
import { DOC_BUCKET } from "./config";
import { detectKind } from "./sniff";
import type { ImageKind } from "./docxTemplate";
import { createClient } from "@/lib/supabase/server";

// The signature and company seal pictures used on offer letters. One file each, in the private documents bucket under
// templates/ (admins only: see supabase/step28_document_templates.sql). Whatever is uploaded is re-drawn by sharp into a
// plain, small PNG (transparency kept, metadata and anything hidden in the file dropped).

export const IMAGE_MAX_BYTES = 1024 * 1024;
const KEY = (kind: ImageKind) => `templates/${kind}.png`;
const LIMITS: Record<ImageKind, { width: number; height: number }> = { signature: { width: 600, height: 240 }, seal: { width: 400, height: 400 } };

export async function saveSigningImage(kind: ImageKind, input: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.byteLength === 0) return { ok: false, error: "Choose a picture first." };
  if (input.byteLength > IMAGE_MAX_BYTES) return { ok: false, error: "That picture is over 1 MB." };
  const type = await detectKind(input);
  if (type !== "png" && type !== "jpeg") return { ok: false, error: "Use a PNG or JPG picture." };

  let png: Buffer;
  try {
    png = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: LIMITS[kind].width, height: LIMITS[kind].height, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That file isn't a readable picture." };
  }

  const supabase = await createClient();
  await supabase.storage.from(DOC_BUCKET).remove([KEY(kind)]); // the bucket has no "replace" rule, so remove the old one first
  const up = await supabase.storage.from(DOC_BUCKET).upload(KEY(kind), png, { contentType: "image/png", upsert: false });
  if (up.error) return { ok: false, error: "Couldn't store the picture. Please try again." };
  return { ok: true };
}

export async function removeSigningImage(kind: ImageKind): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(DOC_BUCKET).remove([KEY(kind)]);
  return !error;
}

/** The picture's PNG bytes, or null when none is uploaded (or it can't be read). */
export async function readSigningImage(kind: ImageKind): Promise<Uint8Array | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DOC_BUCKET).download(KEY(kind));
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function signingImageStatus(): Promise<Record<ImageKind, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(DOC_BUCKET).list("templates", { limit: 50 });
  const names = new Set((data ?? []).map((f) => f.name));
  return { signature: names.has("signature.png"), seal: names.has("seal.png") };
}
