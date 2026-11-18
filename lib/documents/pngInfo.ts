/** Width and height of a PNG, read from its header (no decoding). Null if the bytes aren't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !sig.every((v, i) => bytes[i] === v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Fit a picture inside a box without stretching it. */
export function fitInside(size: { width: number; height: number }, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}
