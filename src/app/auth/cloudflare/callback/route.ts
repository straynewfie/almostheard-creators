import { NextResponse } from "next/server";
import { getDashboardContext } from "@domains/catalogue/context";
import { finishProvisioning } from "@domains/media/onboarding-flow";
import { readStoredSecret, storeOauthGrant } from "@domains/media/onboarding-store";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import {
  cloudflareOAuthConfig,
  cloudflareRedirectUri,
  exchangeAuthorizationCode,
  oauthStateMatches,
} from "@platform/cloudflare/oauth";
import { listCloudflareAccounts } from "@platform/cloudflare/provision";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = request.headers.get("cookie") ?? "";
  const stateCookie = readCookie(jar, "ahc_cf_state");
  const userCookie = readCookie(jar, "ahc_cf_user");
  const returnTo = safeDashboardReturnPath(readCookie(jar, "ahc_cf_return"));
  const redirectUri = cloudflareRedirectUri(url.origin);
  const responseFor = (notice: string, accounts?: Array<{ id: string; name: string }>) => {
    const next = new URL(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=${notice}`, url.origin);
    const response = NextResponse.redirect(next);
    clearOauthCookies(response);
    if (accounts && accounts.length > 0) {
      response.cookies.set("ahc_cf_accounts", encodeURIComponent(JSON.stringify(accounts)), {
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        path: "/",
        maxAge: 600,
      });
    }
    return response;
  };
  if (!redirectUri || !oauthStateMatches(stateCookie, url.searchParams.get("state"))) {
    return responseFor("state");
  }
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite || ctx.creator.auth_user_id !== userCookie) {
    return responseFor("state");
  }
  if (url.searchParams.get("error") || !url.searchParams.get("code")) {
    return responseFor("denied");
  }
  const config = cloudflareOAuthConfig();
  if (!config) return responseFor("platform");
  const exchanged = await exchangeAuthorizationCode({
    fetchImpl: fetch,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code: url.searchParams.get("code") as string,
    redirectUri,
  });
  if ("error" in exchanged) return responseFor("denied");
  const listed = await listCloudflareAccounts({
    fetchImpl: fetch,
    accessToken: exchanged.accessToken,
  });
  if ("error" in listed || listed.accounts.length === 0) return responseFor("account");
  if (listed.accounts.length > 1) {
    const existingSecret = await readStoredSecret(ctx.creator.id);
    if (existingSecret?.purpose === "r2") return responseFor("account");
    const stored = await storeOauthGrant(ctx.creator.id, exchanged.accessToken);
    if (!stored) return responseFor("account");
    return responseFor("choose", listed.accounts);
  }
  const outcome = await finishProvisioning({
    fetchImpl: fetch,
    creatorId: ctx.creator.id,
    accessToken: exchanged.accessToken,
    accountId: listed.accounts[0].id,
    origin: url.origin,
  });
  return responseFor(outcome);
}

function readCookie(header: string, name: string): string | undefined {
  const parts = header.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  if (!found) return undefined;
  return decodeURIComponent(found.slice(name.length + 1));
}

function clearOauthCookies(response: NextResponse) {
  for (const name of ["ahc_cf_state", "ahc_cf_user", "ahc_cf_return"]) {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
}
