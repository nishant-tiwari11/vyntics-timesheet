// Profile pictures: the names and limits shared by the server, the browser and the tests. No server-only imports.

export const AVATAR_BUCKET = "avatars";

/** The biggest photo a person may pick (checked in the browser, before cropping). */
export const AVATAR_PICK_MAX_BYTES = 2 * 1024 * 1024;
/** The biggest file the server accepts. The browser sends the cropped square, which is far smaller than the original. */
export const AVATAR_UPLOAD_MAX_BYTES = 1024 * 1024;
/** Every stored photo is a square of this many pixels, as WebP. */
export const AVATAR_SIZE = 400;
export const AVATAR_PICK_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Where a person's photo lives in the bucket. One fixed file per person, so a new photo replaces the old one. */
export const avatarPath = (userId: string) => `${userId.toLowerCase()}.webp`;

/** The address the browser loads a photo from. `version` changes the address after an upload so the new photo shows at once. */
export const avatarUrl = (userId: string, version?: string | number) => `/timesheet/avatar/${userId}${version ? `?v=${version}` : ""}`;

/** "Nishant Tiwari" → "NT", "nishant" → "N", "" → "?". */
export function initials(name: string | null | undefined): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "?";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}
