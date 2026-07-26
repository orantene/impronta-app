import "server-only";

import {
  exchangeInstagramCode,
  fetchInstagramProfile,
} from "./instagram";
import { exchangeTikTokCode, fetchTikTokProfile } from "./tiktok";
import type { ConnectionOAuthProviderKey } from "./providers";
import {
  setCredentialMode,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";

/**
 * Shared workspace-connect path for the social feed providers.
 *
 * Instagram and TikTok differ in their token flows (see their modules) but land
 * in the SAME storage shape, so the callback routes stay thin and the two
 * cannot drift apart in what they persist:
 *   - vault:  access_token (+ refresh_token where the vendor issues one)
 *   - config: handle/label, account id, token_expires_at, verification status
 *
 * Talent/client-owned connections are deliberately NOT handled here — the feed
 * widget is a workspace-site feature. Adding another owner later means adding a
 * branch, not reshaping this.
 */

export type SocialConnectResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

export async function connectWorkspaceSocialAccount(input: {
  provider: Extract<ConnectionOAuthProviderKey, "instagram" | "tiktok">;
  tenantId: string;
  actorUserId: string;
  code: string;
  redirectUri: string;
}): Promise<SocialConnectResult> {
  const now = new Date().toISOString();

  if (input.provider === "instagram") {
    const token = await exchangeInstagramCode({
      code: input.code,
      redirectUri: input.redirectUri,
    });
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

    await setSecret(input.tenantId, "instagram", "access_token", token.token.accessToken);
    await setIntegrationConfig(
      input.tenantId,
      "instagram",
      {
        profile_url: `https://www.instagram.com/${profile.profile.username}/`,
        handle: profile.profile.username,
        account_id: profile.profile.userId,
        account_type: profile.profile.accountType ?? null,
        token_expires_at: token.token.expiresAt,
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
    return { ok: true, label: profile.profile.username };
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
