/**
 * R2 endpoints are derived from the account id. Callers never supply a signing host.
 * Public base URLs are checked and never fetched.
 */

const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i;
const BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function r2EndpointForAccount(accountId: string): string {
  const id = accountId.trim();
  if (!ACCOUNT_ID_RE.test(id)) {
    throw new Error("The Cloudflare account id is not valid.");
  }
  return `https://${id.toLowerCase()}.r2.cloudflarestorage.com`;
}

export function isValidBucketName(bucket: string): boolean {
  return BUCKET_RE.test(bucket.trim());
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain")
  ) {
    return true;
  }
  if (host.includes(":")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * Accepts only https URLs with a public hostname.
 * IP literals, localhost, and single-label hosts are rejected.
 * This function does not resolve DNS and does not follow redirects.
 */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("The public base URL must be an https URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("The public base URL must use https.");
  }
  if (url.username || url.password) {
    throw new Error("The public base URL cannot include credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("The public base URL must use port 443.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    isBlockedHostname(host) ||
    host.endsWith(".r2.cloudflarestorage.com")
  ) {
    throw new Error("The public base URL host is not allowed.");
  }
  return url;
}
