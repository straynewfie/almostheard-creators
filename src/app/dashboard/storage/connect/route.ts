import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDashboardContext } from "@domains/catalogue/context";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import {
  cloudflareAuthorizeUrl,
  cloudflareOAuthConfig,
  cloudflareRedirectUri,
  requestedCloudflareScope,
} from "@platform/cloudflare/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeDashboardReturnPath(url.searchParams.get("return"));
  const storagePath = `/dashboard/storage?return=${encodeURIComponent(returnTo)}`;
  const back = (notice: string) =>
    NextResponse.redirect(new URL(`${storagePath}&notice=${notice}`, url.origin));
  const ctx = await getDashboardContext();
  if (ctx.kind === "anonymous") {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(storagePath)}`, url.origin));
  }
  if (ctx.kind !== "ready" || !ctx.canWrite) return back("membership");
  const redirectUri = cloudflareRedirectUri(url.origin);
  const config = cloudflareOAuthConfig();
  if (!redirectUri || !config) return back("platform");
  let scope = "workers-r2.write";
  try {
    scope = requestedCloudflareScope();
  } catch {
    return back("platform");
  }
  const state = randomBytes(32).toString("hex");
  const destination = cloudflareAuthorizeUrl({
    clientId: config.clientId,
    redirectUri,
    state,
    scope,
  });
  const response = NextResponse.redirect(destination);
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  };
  response.cookies.set("ahc_cf_state", state, options);
  response.cookies.set("ahc_cf_user", ctx.creator.auth_user_id, options);
  response.cookies.set("ahc_cf_return", returnTo, options);
  return response;
}
