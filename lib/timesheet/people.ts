export function displayName(p: { full_name: string | null; email: string } | null | undefined): string {
  return p?.full_name?.trim() || p?.email || "Unknown";
}
