/**
 * Mutation requests must come from an allowed origin.
 * The request host is trusted. Additional origins come from CREATORS_ALLOWED_ORIGINS.
 */

export function allowedOrigins(input: {
  requestOrigin: string | null;
  configured: string | null | undefined;
}): string[] {
  const origins = new Set<string>();
  if (input.requestOrigin) origins.add(input.requestOrigin);
  for (const part of (input.configured ?? "").split(",")) {
    const value = part.trim();
    if (value) origins.add(value);
  }
  return [...origins];
}

export function isTrustedMutationOrigin(
  originHeader: string | null,
  allowed: readonly string[],
): boolean {
  if (!originHeader) return false;
  try {
    const origin = new URL(originHeader);
    if (origin.origin !== originHeader) return false;
    return allowed.includes(origin.origin);
  } catch {
    return false;
  }
}

export function requestOriginFromHost(host: string | null, proto: string | null): string | null {
  if (!host || host.includes("/") || host.includes("\\")) return null;
  const protocol = proto === "http" ? "http:" : "https:";
  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}
