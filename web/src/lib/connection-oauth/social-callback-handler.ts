import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { userHasCapability } from "@/lib/access";
import { verifyConnectionOAuthState } from "./state";
import { connectWorkspaceSocialAccount } from "./social-connect";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

/**
 * One OAuth-callback handler for both social feed vendors.
 *
 * The Google/YouTube callback predates this and owns three OWNER kinds
 * (talent / client / workspace); the feed providers are workspace-only, so this
 * stays deliberately narrow rather than being generalised into that route.
 *
 * Every failure path redirects back with a `connection_error` code instead of
 * rendering an error page — the operator started in Settings and must land back
 * there with a reason, never on a dead URL.
 */
export async function handleSocialOAuthCallback(
  request: NextRequest,
  provider: "instagram" | "tiktok",
): Promise<NextResponse> {
  const redirectBack = (returnTo: string, params: Record<string, string>) => {
    const url = new URL(returnTo, getAppUrl());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const rawState = request.nextUrl.searchParams.get("state");
  const stateResult = await verifyConnectionOAuthState(rawState);
  const returnTo = stateResult.ok ? stateResult.state.returnTo : stateResult.returnTo;

  if (error) return redirectBack(returnTo, { connection_error: error });
  if (!stateResult.ok) return redirectBack(returnTo, { connection_error: "invalid_state" });
  if (!code) return redirectBack(returnTo, { connection_error: "missing_code" });
  // The signed state carries which provider started the flow; a state minted
  // for one vendor must not be redeemable at another's callback.
  if (stateResult.state.provider !== provider) {
    return redirectBack(returnTo, { connection_error: "provider_mismatch" });
  }

  const session = await requireSession();
  if (!session.ok || session.user.id !== stateResult.state.actorUserId) {
    return redirectBack(returnTo, { connection_error: "not_authorized" });
  }

  if (stateResult.state.owner !== "workspace") {
    return redirectBack(returnTo, { connection_error: "unsupported_owner" });
  }
  const tenantSlug = stateResult.state.tenantSlug;
  if (!tenantSlug) return redirectBack(returnTo, { connection_error: "not_authorized" });

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope || scope.tenantId !== stateResult.state.subjectId) {
    return redirectBack(returnTo, { connection_error: "not_authorized" });
  }
  const canManage = await userHasCapability("manage_agency_settings", scope.tenantId);
  if (!canManage) return redirectBack(returnTo, { connection_error: "not_authorized" });

  try {
    const result = await connectWorkspaceSocialAccount({
      provider,
      tenantId: scope.tenantId,
      actorUserId: session.user.id,
      code,
      redirectUri: `${getAppUrl()}/api/connections/oauth/callback/${provider}`,
    });
    if (!result.ok) {
      // Surface the vendor's reason (e.g. "that account is personal") rather
      // than a generic failure — it is the difference between a fixable
      // message and a mystery.
      return redirectBack(returnTo, {
        connection_error: "connect_failed",
        connection_message: result.error,
      });
    }
    return redirectBack(returnTo, {
      connection_success: provider,
      connection_account: result.label,
    });
  } catch (err) {
    logServerError(`connection_oauth.${provider}_callback`, err);
    return redirectBack(returnTo, { connection_error: "save_failed" });
  }
}
