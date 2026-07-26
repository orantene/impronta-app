import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshInstagramToken } from "@/lib/connection-oauth/instagram";
import { refreshTikTokToken } from "@/lib/connection-oauth/tiktok";
import {
  getDecryptedSecret,
  setIntegrationConfig,
  setSecret,
} from "@/lib/integrations/repository";

/**
 * Social token refresh sweep.
 *
 * WHY THIS IS NOT OPTIONAL: Instagram long-lived tokens expire at 60 days and
 * TikTok access tokens at ~24 hours. Without this sweep every connected tenant's
 * feed goes dark at roughly the same time, long after launch, with no signal.
 *
 * Refresh windows are deliberately conservative:
 *   - Instagram: refresh when <15 days remain. Meta requires the token be at
 *     least 24h old and still valid, so refreshing early and often is safe;
 *     refreshing late is not recoverable without the operator reconnecting.
 *   - TikTok: refresh when <6 hours remain (or the expiry is unknown).
 *
 * On unrecoverable failure the integration row is marked so the Settings card
 * can say "Reconnect needed" — a distinct, actionable state, never a silent
 * empty feed.
 */

const IG_REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const TT_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

export type SocialTokenSweepResult = {
  scanned: number;
  refreshed: number;
  failed: number;
  skipped: number;
};

function needsRefresh(expiresAt: unknown, windowMs: number): boolean {
  if (typeof expiresAt !== "string" || !expiresAt) return true; // unknown → try
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return true;
  return ms - Date.now() < windowMs;
}

async function markReconnectNeeded(
  tenantId: string,
  key: string,
  config: Record<string, unknown>,
  error: string,
) {
  await setIntegrationConfig(
    tenantId,
    key,
    { ...config, needs_reconnect: true },
    { status: "error", lastError: error },
  );
}

export async function sweepSocialTokens(
  admin: SupabaseClient,
): Promise<SocialTokenSweepResult> {
  const out: SocialTokenSweepResult = { scanned: 0, refreshed: 0, failed: 0, skipped: 0 };

  const { data, error } = await admin
    .from("tenant_integrations")
    .select("tenant_id, integration_key, config_json, status")
    .in("integration_key", ["instagram", "tiktok"])
    .eq("status", "connected");
  if (error || !data) return out;

  for (const row of data as Array<{
    tenant_id: string;
    integration_key: string;
    config_json: Record<string, unknown> | null;
    status: string;
  }>) {
    out.scanned += 1;
    const config = row.config_json ?? {};
    const key = row.integration_key;

    if (key === "instagram") {
      if (!needsRefresh(config.token_expires_at, IG_REFRESH_WINDOW_MS)) {
        out.skipped += 1;
        continue;
      }
      const token = await getDecryptedSecret(row.tenant_id, "instagram", "access_token");
      if (!token) {
        out.failed += 1;
        await markReconnectNeeded(row.tenant_id, key, config, "Stored token missing.");
        continue;
      }
      const res = await refreshInstagramToken(token);
      if (!res.ok) {
        out.failed += 1;
        await markReconnectNeeded(row.tenant_id, key, config, res.error);
        continue;
      }
      await setSecret(row.tenant_id, "instagram", "access_token", res.accessToken);
      await setIntegrationConfig(
        row.tenant_id,
        key,
        { ...config, token_expires_at: res.expiresAt, needs_reconnect: false },
        { status: "connected", lastError: null, lastVerifiedAt: new Date().toISOString() },
      );
      out.refreshed += 1;
      continue;
    }

    if (!needsRefresh(config.token_expires_at, TT_REFRESH_WINDOW_MS)) {
      out.skipped += 1;
      continue;
    }
    const refreshToken = await getDecryptedSecret(row.tenant_id, "tiktok", "refresh_token");
    if (!refreshToken) {
      out.failed += 1;
      await markReconnectNeeded(row.tenant_id, key, config, "Stored refresh token missing.");
      continue;
    }
    const res = await refreshTikTokToken(refreshToken);
    if (!res.ok) {
      out.failed += 1;
      await markReconnectNeeded(row.tenant_id, key, config, res.error);
      continue;
    }
    await setSecret(row.tenant_id, "tiktok", "access_token", res.token.accessToken);
    if (res.token.refreshToken) {
      // TikTok ROTATES the refresh token — storing the new one is required or
      // the next sweep fails with an invalid grant.
      await setSecret(row.tenant_id, "tiktok", "refresh_token", res.token.refreshToken);
    }
    await setIntegrationConfig(
      row.tenant_id,
      key,
      { ...config, token_expires_at: res.token.expiresAt, needs_reconnect: false },
      { status: "connected", lastError: null, lastVerifiedAt: new Date().toISOString() },
    );
    out.refreshed += 1;
  }

  return out;
}
