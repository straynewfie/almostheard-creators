import { timingSafeEqual } from "node:crypto";

/**
 * Private Cloudflare OAuth client. The client secret stays on the server.
 * The requested scope is R2 write only. API token write is refused here
 * until a private test shows it is required and the owner approves it.
 */

export function oauthStateMatches(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

const AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
export const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const DEFAULT_SCOPE = "workers-r2.write";

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

export function cloudflareOAuthConfigured(): boolean {
  return cloudflareOAuthConfig() !== null;
}

export function cloudflareOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.CREATORS_CLOUDFLARE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.CREATORS_CLOUDFLARE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function requestedCloudflareScope(): string {
  const value = (process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE?.trim() || DEFAULT_SCOPE);
  if (!/^[a-z0-9._:-]{3,80}$/i.test(value) || /token/i.test(value) || value === "offline_access") {
    throw new Error("The Cloudflare scope is not allowed.");
  }
  return value;
}

export function cloudflareRedirectUri(origin: string): string | null {
  const trimmed = origin.replace(/\/$/, "");
  if (LOCAL_ORIGINS.has(trimmed) || trimmed === "https://creators.almostheard.ca") {
    return `${trimmed}/auth/cloudflare/callback`;
  }
  const extra = (process.env.CREATORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter((item) => item.startsWith("https://"));
  if (extra.includes(trimmed)) return `${trimmed}/auth/cloudflare/callback`;
  return null;
}

export function cloudflareAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
}): string {
  if (!/^[a-f0-9]{32,}$/i.test(input.state)) {
    throw new Error("The authorization state is not valid.");
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeAuthorizationCode(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string } | { error: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const response = await input.fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return { error: "Cloudflare did not accept the authorization." };
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) return { error: "Cloudflare did not return an access token." };
  return { accessToken: payload.access_token };
}
