// The one place server errors are logged. It prints only the error's name, code and message:
// never the whole object, because database errors can carry row values in `details`.
export function logError(scope: string, e: unknown): void {
  const err = (e ?? {}) as { name?: string; code?: string; message?: string };
  const text = [err.name, err.code, err.message].filter(Boolean).join(" | ");
  console.error(`[${scope}]`, text || "unknown error");
}
