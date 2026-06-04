import { NextRequest, NextResponse } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { userHasCapability } from "@/lib/access";
import { resolveClientConnectionTenant } from "@/lib/connection-oauth/ownership";
import { getConnectionOAuthProvider } from "@/lib/connection-oauth/providers";
import { verifyConnectionOAuthState } from "@/lib/connection-oauth/state";
import {
  exchangeGoogleConnectionCode,
  fetchYouTubeChannelProof,
  type YouTubeChannelProof,
} from "@/lib/connection-oauth/youtube";
import {
  setClientIntegrationSecret,
  syncClientIntegrationTrustSignalForTenant,
  upsertClientIntegration,
} from "@/lib/client-integrations/repository";
import {
  getTenantIntegration,
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";
import { applyWorkspaceYouTubePublishState } from "@/lib/integrations/workspace-social-sync";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import {
  setTalentIntegrationSecret,
  syncTalentIntegrationTrustBadge,
  upsertTalentIntegration,
} from "@/lib/talent-integrations/repository";

export const dynamic = "force-dynamic";

function redirectBack(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, getAppUrl());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function storeTalentYouTubeConnection(input: {
  talentProfileId: string;
  actorUserId: string;
  token: { access_token: string; refresh_token?: string; scope?: string };
  expiresAt: string | null;
  proof: YouTubeChannelProof;
}) {
  const now = new Date().toISOString();
  await setTalentIntegrationSecret(
    input.talentProfileId,
    "youtube",
    "access_token",
    input.token.access_token,
  );
  if (input.token.refresh_token) {
    await setTalentIntegrationSecret(
      input.talentProfileId,
      "youtube",
      "refresh_token",
      input.token.refresh_token,
    );
  }

  const row = await upsertTalentIntegration({
    talentProfileId: input.talentProfileId,
    providerKey: "youtube",
    providerAccountId: input.proof.channelId,
    providerAccountLabel: input.proof.title,
    connectionMethod: "oauth",
    status: "connected",
    scopes: ["identity", "profile", "media"],
    settingsJson: {
      profileUrl: input.proof.profileUrl,
      tokenExpiresAt: input.expiresAt,
    },
    metadataCache: {
      verification_status: "oauth_verified",
      provider: "youtube",
      channel_id: input.proof.channelId,
      title: input.proof.title,
      custom_url: input.proof.customUrl,
      thumbnail_url: input.proof.thumbnailUrl,
      profile_url: input.proof.profileUrl,
      token_scope: input.token.scope ?? null,
    },
    lastSyncAt: now,
    lastVerifiedAt: now,
    lastError: null,
    actorId: input.actorUserId,
  });
  if (row) await syncTalentIntegrationTrustBadge(row, input.actorUserId);
  return row;
}

async function storeClientYouTubeConnection(input: {
  userId: string;
  actorUserId: string;
  tenantSlug: string | null;
  token: { access_token: string; refresh_token?: string; scope?: string };
  expiresAt: string | null;
  proof: YouTubeChannelProof;
}) {
  const now = new Date().toISOString();
  await setClientIntegrationSecret(
    input.userId,
    "youtube",
    "access_token",
    input.token.access_token,
  );
  if (input.token.refresh_token) {
    await setClientIntegrationSecret(
      input.userId,
      "youtube",
      "refresh_token",
      input.token.refresh_token,
    );
  }

  const row = await upsertClientIntegration({
    userId: input.userId,
    providerKey: "youtube",
    providerAccountId: input.proof.channelId,
    providerAccountLabel: input.proof.title,
    connectionMethod: "oauth",
    status: "connected",
    scopes: ["identity", "profile"],
    settingsJson: {
      profileUrl: input.proof.profileUrl,
      tokenExpiresAt: input.expiresAt,
    },
    metadataCache: {
      verification_status: "oauth_verified",
      provider: "youtube",
      channel_id: input.proof.channelId,
      title: input.proof.title,
      custom_url: input.proof.customUrl,
      thumbnail_url: input.proof.thumbnailUrl,
      profile_url: input.proof.profileUrl,
      token_scope: input.token.scope ?? null,
    },
    lastSyncAt: now,
    lastVerifiedAt: now,
    lastError: null,
    actorId: input.actorUserId,
  });

  if (row && input.tenantSlug) {
    const tenant = await resolveClientConnectionTenant({
      userId: input.userId,
      tenantSlug: input.tenantSlug,
    });
    if (tenant) {
      await syncClientIntegrationTrustSignalForTenant(row, tenant.tenantId);
    }
  }
  return row;
}

async function storeWorkspaceYouTubeConnection(input: {
  tenantId: string;
  actorUserId: string;
  token: { access_token: string; refresh_token?: string; scope?: string };
  expiresAt: string | null;
  proof: YouTubeChannelProof;
}) {
  const provider = getConnectionOAuthProvider("youtube");
  const key = provider?.workspaceIntegrationKey ?? "youtube";
  const now = new Date().toISOString();

  await setSecret(input.tenantId, key, "access_token", input.token.access_token);
  if (input.token.refresh_token) {
    await setSecret(input.tenantId, key, "refresh_token", input.token.refresh_token);
  }

  // Preserve a prior public-site opt-in across a re-connect; a fresh connect
  // defaults OFF (privacy-first — verification ≠ publishing).
  const existing = await getTenantIntegration(input.tenantId, key);
  const previousProfileUrl =
    typeof existing?.config_json?.profile_url === "string"
      ? (existing.config_json.profile_url as string)
      : null;
  const showOnPublicSite =
    existing?.config_json?.show_on_public_site === true;

  const row = await setIntegrationConfig(
    input.tenantId,
    key,
    {
      profile_url: input.proof.profileUrl,
      channel_id: input.proof.channelId,
      channel_title: input.proof.title,
      custom_url: input.proof.customUrl,
      thumbnail_url: input.proof.thumbnailUrl,
      token_expires_at: input.expiresAt,
      token_scope: input.token.scope ?? null,
      verification_status: "oauth_verified",
      // Privacy-first: verifying ownership does NOT auto-publish the channel to
      // the public site. The workspace opts in via the "Show on public site"
      // toggle in the integration drawer.
      show_on_public_site: showOnPublicSite,
    },
    {
      status: "connected",
      connectionMethod: "oauth",
      lastVerifiedAt: now,
      lastError: null,
      actorId: input.actorUserId,
    },
  );
  if (!row) return null;

  await setCredentialMode(input.tenantId, key, "custom", input.actorUserId);
  // Reconcile the public-site identity through the single toggle-aware path:
  // publish only when the workspace has opted in.
  await applyWorkspaceYouTubePublishState({
    tenantId: input.tenantId,
    config: row.config_json as Record<string, unknown>,
    previousProfileUrl,
    actorUserId: input.actorUserId,
  });
  return row;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const rawState = request.nextUrl.searchParams.get("state");
  const stateResult = await verifyConnectionOAuthState(rawState);
  const returnTo = stateResult.ok ? stateResult.state.returnTo : stateResult.returnTo;

  if (error) {
    return redirectBack(returnTo, { connection_error: error });
  }
  if (!stateResult.ok) {
    return redirectBack(returnTo, { connection_error: "invalid_state" });
  }
  if (!code) {
    return redirectBack(returnTo, { connection_error: "missing_code" });
  }

  const session = await requireSession();
  if (!session.ok || session.user.id !== stateResult.state.actorUserId) {
    return redirectBack(returnTo, { connection_error: "not_authorized" });
  }

  const redirectUri = `${getAppUrl()}/api/connections/oauth/callback/google`;
  try {
    const tokenResult = await exchangeGoogleConnectionCode({ code, redirectUri });
    if (!tokenResult.ok) {
      return redirectBack(returnTo, { connection_error: "token_exchange_failed" });
    }

    const proofResult = await fetchYouTubeChannelProof(tokenResult.token.access_token);
    if (!proofResult.ok) {
      return redirectBack(returnTo, { connection_error: "youtube_channel_missing" });
    }

    if (stateResult.state.owner === "talent") {
      const row = await storeTalentYouTubeConnection({
        talentProfileId: stateResult.state.subjectId,
        actorUserId: session.user.id,
        token: tokenResult.token,
        expiresAt: tokenResult.expiresAt,
        proof: proofResult.proof,
      });
      if (!row) return redirectBack(returnTo, { connection_error: "save_failed" });
    } else if (stateResult.state.owner === "client") {
      const row = await storeClientYouTubeConnection({
        userId: stateResult.state.subjectId,
        actorUserId: session.user.id,
        tenantSlug: stateResult.state.tenantSlug,
        token: tokenResult.token,
        expiresAt: tokenResult.expiresAt,
        proof: proofResult.proof,
      });
      if (!row) return redirectBack(returnTo, { connection_error: "save_failed" });
    } else {
      const tenantSlug = stateResult.state.tenantSlug;
      if (!tenantSlug) {
        return redirectBack(returnTo, { connection_error: "not_authorized" });
      }
      const scope = await getTenantScopeBySlug(tenantSlug);
      if (!scope || scope.tenantId !== stateResult.state.subjectId) {
        return redirectBack(returnTo, { connection_error: "not_authorized" });
      }
      const canManage = await userHasCapability(
        "manage_agency_settings",
        scope.tenantId,
      );
      if (!canManage) {
        return redirectBack(returnTo, { connection_error: "not_authorized" });
      }
      const row = await storeWorkspaceYouTubeConnection({
        tenantId: scope.tenantId,
        actorUserId: session.user.id,
        token: tokenResult.token,
        expiresAt: tokenResult.expiresAt,
        proof: proofResult.proof,
      });
      if (!row) return redirectBack(returnTo, { connection_error: "save_failed" });
    }

    return redirectBack(returnTo, {
      connection: "youtube_connected",
    });
  } catch (err) {
    logServerError("connections.oauth.googleCallback", err);
    return redirectBack(returnTo, { connection_error: "unexpected" });
  }
}
