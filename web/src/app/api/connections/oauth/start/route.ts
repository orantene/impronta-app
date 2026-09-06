import { NextRequest, NextResponse } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { userHasCapability } from "@/lib/access";
import { resolveClientConnectionTenant } from "@/lib/connection-oauth/ownership";
import {
  buildConnectionAuthorizationRedirect,
  getConnectionOAuthProvider,
  type ConnectionOAuthProvider,
} from "@/lib/connection-oauth/providers";
import { createConnectionOAuthState } from "@/lib/connection-oauth/state";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireClient, requireSession } from "@/lib/server/action-guards";
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

/**
 * The one exit every owner branch takes: sign the state, then build the
 * vendor's authorization URL with the vendor's own callback as redirect URI.
 * The three branches used to build their URLs separately, and two of them
 * hard-coded the Google route for every provider.
 */
async function redirectToVendor(input: {
  provider: ConnectionOAuthProvider;
  state: Parameters<typeof createConnectionOAuthState>[0];
  returnTo: string;
}) {
  const state = await createConnectionOAuthState(input.state);
  if (!state.ok) return failureRedirect(input.returnTo, "oauth_setup");
  const auth = buildConnectionAuthorizationRedirect({
    provider: input.provider,
    state: state.token,
    appUrl: getAppUrl(),
  });
  if (!auth.ok) return failureRedirect(input.returnTo, "oauth_setup");
  return NextResponse.redirect(auth.url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const providerKey = searchParams.get("provider") ?? "";
  const owner = searchParams.get("owner");
  const tenantSlug = searchParams.get("tenantSlug");
  const provider = getConnectionOAuthProvider(providerKey);
  // Only vendors with a built `/callback/{vendor}` route may start a flow, so a
  // registry entry alone can never expose a half-built provider. Widen this
  // deliberately, per vendor, as each callback lands.
  const VENDORS_WITH_CALLBACK = new Set(["google", "instagram", "tiktok"]);
  if (!provider || !VENDORS_WITH_CALLBACK.has(provider.oauthProvider)) {
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
    return redirectToVendor({
      provider,
      returnTo,
      state: {
        owner,
        provider: provider.key,
        actorUserId: guard.session.user.id,
        subjectId: guard.talentProfile.id,
        tenantSlug: null,
        returnTo,
        fallbackReturnTo: "/talent/settings",
      },
    });
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
    return redirectToVendor({
      provider,
      returnTo,
      state: {
        owner,
        provider: provider.key,
        actorUserId: guard.user.id,
        subjectId: guard.user.id,
        tenantSlug: tenant?.tenantSlug ?? null,
        returnTo,
        fallbackReturnTo: fallback,
      },
    });
  }

  if (owner === "workspace") {
    const slug = tenantSlug?.trim() ?? "";
    const fallback = slug ? `/${slug}/admin/settings` : "/admin/settings";
    const returnTo = normalizeReturnTo(searchParams.get("returnTo"), fallback);
    const guard = await requireSession();
    if (!guard.ok || !slug) {
      return failureRedirect(returnTo, "not_authorized");
    }
    const scope = await getTenantScopeBySlug(slug);
    if (!scope) {
      return failureRedirect(returnTo, "not_authorized");
    }
    const canManage = await userHasCapability(
      "manage_agency_settings",
      scope.tenantId,
    );
    if (!canManage) {
      return failureRedirect(returnTo, "not_authorized");
    }
    return redirectToVendor({
      provider,
      returnTo,
      state: {
        owner,
        provider: provider.key,
        actorUserId: guard.user.id,
        subjectId: scope.tenantId,
        tenantSlug: slug,
        returnTo,
        fallbackReturnTo: fallback,
      },
    });
  }

  return failureRedirect("/", "invalid_owner");
}
