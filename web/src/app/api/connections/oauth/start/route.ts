import { NextRequest, NextResponse } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { resolveClientConnectionTenant } from "@/lib/connection-oauth/ownership";
import { getConnectionOAuthProvider } from "@/lib/connection-oauth/providers";
import { createConnectionOAuthState } from "@/lib/connection-oauth/state";
import { buildGoogleConnectionAuthorizationUrl } from "@/lib/connection-oauth/youtube";
import { requireClient } from "@/lib/server/action-guards";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

export const dynamic = "force-dynamic";

function failureRedirect(returnTo: string, error: string) {
  const url = new URL(returnTo, getAppUrl());
  url.searchParams.set("connection_error", error);
  return NextResponse.redirect(url);
}

function normalizeReturnTo(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw.slice(0, 500);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const providerKey = searchParams.get("provider") ?? "";
  const owner = searchParams.get("owner");
  const tenantSlug = searchParams.get("tenantSlug");
  const provider = getConnectionOAuthProvider(providerKey);
  if (!provider || provider.oauthProvider !== "google") {
    return failureRedirect("/", "unsupported_provider");
  }

  if (owner === "talent") {
    const guard = await requireTalentSelf();
    const returnTo = normalizeReturnTo(
      searchParams.get("returnTo"),
      "/talent/settings",
    );
    if (!guard.ok) {
      return failureRedirect(returnTo, "not_authorized");
    }
    const state = await createConnectionOAuthState({
      owner,
      provider: provider.key,
      actorUserId: guard.session.user.id,
      subjectId: guard.talentProfile.id,
      tenantSlug: null,
      returnTo,
      fallbackReturnTo: "/talent/settings",
    });
    if (!state.ok) return failureRedirect(returnTo, "oauth_setup");

    const redirectUri = `${getAppUrl()}/api/connections/oauth/callback/google`;
    const auth = buildGoogleConnectionAuthorizationUrl({
      state: state.token,
      redirectUri,
    });
    if (!auth.ok) return failureRedirect(returnTo, "oauth_setup");
    return NextResponse.redirect(auth.url);
  }

  if (owner === "client") {
    const guard = await requireClient();
    const fallback = tenantSlug ? `/${tenantSlug}/client/settings` : "/client/settings";
    const returnTo = normalizeReturnTo(searchParams.get("returnTo"), fallback);
    if (!guard.ok) {
      return failureRedirect(returnTo, "not_authorized");
    }
    const tenant = await resolveClientConnectionTenant({
      userId: guard.user.id,
      tenantSlug,
    });
    if (tenantSlug && !tenant) {
      return failureRedirect(returnTo, "not_authorized");
    }
    const state = await createConnectionOAuthState({
      owner,
      provider: provider.key,
      actorUserId: guard.user.id,
      subjectId: guard.user.id,
      tenantSlug: tenant?.tenantSlug ?? null,
      returnTo,
      fallbackReturnTo: fallback,
    });
    if (!state.ok) return failureRedirect(returnTo, "oauth_setup");

    const redirectUri = `${getAppUrl()}/api/connections/oauth/callback/google`;
    const auth = buildGoogleConnectionAuthorizationUrl({
      state: state.token,
      redirectUri,
    });
    if (!auth.ok) return failureRedirect(returnTo, "oauth_setup");
    return NextResponse.redirect(auth.url);
  }

  return failureRedirect("/", "invalid_owner");
}
