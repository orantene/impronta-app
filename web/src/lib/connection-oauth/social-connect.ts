import "server-only";

import {
  exchangeInstagramCode,
  fetchInstagramProfile,
  type InstagramProfile,
  type InstagramTokenResult,
} from "./instagram";
import { exchangeTikTokCode, fetchTikTokProfile } from "./tiktok";
import type { ConnectionOAuthProviderKey } from "./providers";
import {
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";
import { INSTAGRAM_TALENT_INTEGRATION_KEY } from "@/lib/talent-integrations/catalog";
import {
  setTalentIntegrationSecret,
  syncTalentIntegrationTrustBadge,
  upsertTalentIntegration,
} from "@/lib/talent-integrations/repository";

/**
 * Shared workspace-connect path for the social feed providers.
 *
 * Instagram and TikTok differ in their token flows (see their modules) but land
 * in the SAME storage shape, so the callback routes stay thin and the two
 * cannot drift apart in what they persist:
 *   - vault:  access_token (+ refresh_token where the vendor issues one)
 *   - config: handle/label, account id, token_expires_at, verification status
 *
 * Talent-owned Instagram lands in `talent_integrations` instead (see
 * `connectTalentInstagramAccount`); the token exchange and the Business/Creator
 * gate are shared so the two owners cannot accept different accounts.
 */

export type SocialConnectResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

async function redeemInstagramGrant(
  code: string,
  redirectUri: string,
): Promise<
  | { ok: true; token: InstagramTokenResult; profile: InstagramProfile }
  | { ok: false; error: string }
> {
  const token = await exchangeInstagramCode({ code, redirectUri });
  if (!token.ok) return { ok: false, error: token.error };

  const profile = await fetchInstagramProfile(token.token.accessToken);
  if (!profile.ok) return { ok: false, error: profile.error };

  // Business/Creator gate: the API answers for personal accounts too, but the
  // media endpoints do not, so a personal account would connect "successfully"
  // and then render an empty feed forever. Refuse it here with a reason.
  const type = (profile.profile.accountType ?? "").toUpperCase();
  if (type && type !== "BUSINESS" && type !== "CREATOR" && type !== "MEDIA_CREATOR") {
    return {
      ok: false,
      error:
        "That Instagram account is personal. Switch it to a Business or Creator account in the Instagram app, then connect again.",
    };
  }
  return { ok: true, token: token.token, profile: profile.profile };
}

/**
 * Talent-owned Instagram. Storage mirrors the workspace shape inside the talent
 * tables: the token in `talent_integration_secrets`, the handle and expiry in
 * `settings_json` (snake_case keys, so the token sweep reads both owners the
 * same way).
 */
export async function connectTalentInstagramAccount(input: {
  talentProfileId: string;
  actorUserId: string;
  code: string;
  redirectUri: string;
}): Promise<SocialConnectResult> {
  const grant = await redeemInstagramGrant(input.code, input.redirectUri);
  if (!grant.ok) return grant;
  const { token, profile } = grant;
  const now = new Date().toISOString();

  const stored = await setTalentIntegrationSecret(
    input.talentProfileId,
    INSTAGRAM_TALENT_INTEGRATION_KEY,
    "access_token",
    token.accessToken,
  );
  if (!stored) return { ok: false, error: "Could not save the Instagram connection." };

  const profileUrl = `https://www.instagram.com/${profile.username}/`;
  const row = await upsertTalentIntegration({
    talentProfileId: input.talentProfileId,
    providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
    providerAccountId: profile.userId,
    providerAccountLabel: profile.username,
    connectionMethod: "oauth",
    status: "connected",
    scopes: ["identity", "profile", "media"],
    settingsJson: {
      profile_url: profileUrl,
      handle: profile.username,
      account_type: profile.accountType ?? null,
      token_expires_at: token.expiresAt,
      needs_reconnect: false,
    },
    metadataCache: {
      verification_status: "oauth_verified",
      provider: "instagram",
      account_id: profile.userId,
      username: profile.username,
      profile_url: profileUrl,
      media_count: profile.mediaCount ?? null,
    },
    lastVerifiedAt: now,
    lastError: null,
    actorId: input.actorUserId,
  });
  if (!row) return { ok: false, error: "Could not save the Instagram connection." };
  await syncTalentIntegrationTrustBadge(row, input.actorUserId);
  return { ok: true, label: profile.username };
}

export async function connectWorkspaceSocialAccount(input: {
  provider: Extract<ConnectionOAuthProviderKey, "instagram" | "tiktok">;
  tenantId: string;
  actorUserId: string;
  code: string;
  redirectUri: string;
}): Promise<SocialConnectResult> {
  const now = new Date().toISOString();

  if (input.provider === "instagram") {
    const grant = await redeemInstagramGrant(input.code, input.redirectUri);
    if (!grant.ok) return grant;
    const { token, profile } = grant;

    await setSecret(input.tenantId, "instagram", "access_token", token.accessToken);
    await setIntegrationConfig(
      input.tenantId,
      "instagram",
      {
        profile_url: `https://www.instagram.com/${profile.username}/`,
        handle: profile.username,
        account_id: profile.userId,
        account_type: profile.accountType ?? null,
        token_expires_at: token.expiresAt,
        verification_status: "oauth_verified",
      },
      {
        status: "connected",
        connectionMethod: "oauth",
        lastVerifiedAt: now,
        lastError: null,
        actorId: input.actorUserId,
      },
    );
    await setCredentialMode(input.tenantId, "instagram", "custom", input.actorUserId);
    return { ok: true, label: profile.username };
  }

  const token = await exchangeTikTokCode({
    code: input.code,
    redirectUri: input.redirectUri,
  });
  if (!token.ok) return { ok: false, error: token.error };

  const profile = await fetchTikTokProfile(token.token.accessToken);
  if (!profile.ok) return { ok: false, error: profile.error };

  await setSecret(input.tenantId, "tiktok", "access_token", token.token.accessToken);
  if (token.token.refreshToken) {
    await setSecret(input.tenantId, "tiktok", "refresh_token", token.token.refreshToken);
  }
  const handle = profile.profile.username ?? profile.profile.displayName ?? "";
  await setIntegrationConfig(
    input.tenantId,
    "tiktok",
    {
      profile_url: handle ? `https://www.tiktok.com/@${handle}` : null,
      handle,
      account_id: profile.profile.openId,
      display_name: profile.profile.displayName,
      avatar_url: profile.profile.avatarUrl,
      token_expires_at: token.token.expiresAt,
      token_scope: token.token.scope,
      verification_status: "oauth_verified",
    },
    {
      status: "connected",
      connectionMethod: "oauth",
      lastVerifiedAt: now,
      lastError: null,
      actorId: input.actorUserId,
    },
  );
  await setCredentialMode(input.tenantId, "tiktok", "custom", input.actorUserId);
  return { ok: true, label: handle || "TikTok" };
}
