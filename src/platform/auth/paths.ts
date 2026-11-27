const DEFAULT_PATH = "/dashboard";

/**
 * Same-origin dashboard return path. Rejects protocol-relative and external values.
 * Adapted from Originals src/platform/auth/paths.ts, pointed at /dashboard.
 */
export function safeDashboardReturnPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_PATH,
): string {
  const candidate = value?.trim() ?? "";
  if (
    candidate.startsWith("/dashboard") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\") &&
    !candidate.includes("://") &&
    !candidate.includes("\n") &&
    !candidate.includes("\r")
  ) {
    return candidate;
  }
  return fallback;
}

export function safeAuthNextPath(value: string | null | undefined): string {
  return safeDashboardReturnPath(value, DEFAULT_PATH);
}
