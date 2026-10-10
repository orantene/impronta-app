import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshInstagramToken } from "@/lib/connection-oauth/instagram";
import { emitNotification } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";
import { INSTAGRAM_TALENT_INTEGRATION_KEY } from "@/lib/talent-integrations/catalog";
import {
  getDecryptedTalentIntegrationSecret,
  setTalentIntegrationSecret,
  upsertTalentIntegration,
} from "@/lib/talent-integrations/repository";
import type { SocialTokenSweepResult } from "./logic";
import {
  IG_REFRESH_WINDOW_MS,
  backoffElapsed,
  failureConfig,
  isFatalFailure,
  needsRefresh,
} from "./token-policy";

/**
 * Talent-owned Instagram tokens. Same policy as the workspace sweep, applied
 * to `talent_integrations.settings_json`. A dead grant lands as `needs_reauth`
 * (the talent card's Reconnect state) and the talent is notified once.
 */

type TalentRow = {
  talent_profile_id: string;
  settings_json: Record<string, unknown> | null;
  status: string;
};

async function notifyTalentNeedsReconnect(
  admin: SupabaseClient,
  talentProfileId: string,
  reason: string,
): Promise<void> {
  try {
    const { data } = await admin
      .from("talent_profiles")
      .select("user_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    const userId = (data as { user_id: string | null } | null)?.user_id;
    if (!userId) return;
    await emitNotification({
      userId,
      tenantId: null,
      kind: "system",
      surface: "talent",
      title: "Reconnect Instagram",
      body:
        "We can no longer refresh your Instagram connection, so the feed on your site will stop " +
        `updating. Open Settings, Connections and reconnect Instagram to fix it. (${reason})`,
      targetDrawer: null,
      targetPayload: { integrationKey: INSTAGRAM_TALENT_INTEGRATION_KEY },
      originEventId: null,
      originKind: "talent_social_token_needs_reconnect",
    });
  } catch (err) {
    logServerError("cron/refresh-social-tokens:talent-notify", err);
  }
}

async function recordTalentFailure(
  admin: SupabaseClient,
  row: TalentRow,
  error: string,
  fatal: boolean,
): Promise<boolean> {
  const next = failureConfig(row.settings_json ?? {}, error, {
    fatal,
    nowIso: new Date().toISOString(),
  });
  await upsertTalentIntegration({
    talentProfileId: row.talent_profile_id,
    providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
    status: next.flagged ? "needs_reauth" : "error",
    settingsJson: next.config,
    lastError: error,
  });
  if (next.transitioned) {
    await notifyTalentNeedsReconnect(admin, row.talent_profile_id, error);
    return true;
  }
  return false;
}

export async function sweepTalentInstagramTokens(
  admin: SupabaseClient,
): Promise<SocialTokenSweepResult> {
  const out: SocialTokenSweepResult = {
    scanned: 0,
    refreshed: 0,
    failed: 0,
    skipped: 0,
    backedOff: 0,
    needsReconnect: 0,
  };

  const { data, error } = await admin
    .from("talent_integrations")
    .select("talent_profile_id, settings_json, status")
    .eq("provider_key", INSTAGRAM_TALENT_INTEGRATION_KEY)
    .eq("connection_method", "oauth")
    .in("status", ["connected", "error"]);
  if (error || !data) return out;

  const now = Date.now();
  for (const row of data as TalentRow[]) {
    out.scanned += 1;
    const config = row.settings_json ?? {};
    if (config.needs_reconnect === true) {
      out.skipped += 1;
      continue;
    }
    if (!backoffElapsed(config, now)) {
      out.backedOff += 1;
      continue;
    }
    if (!needsRefresh(config.token_expires_at, IG_REFRESH_WINDOW_MS, now)) {
      out.skipped += 1;
      continue;
    }

    const token = await getDecryptedTalentIntegrationSecret(
      row.talent_profile_id,
      INSTAGRAM_TALENT_INTEGRATION_KEY,
      "access_token",
    );
    if (!token) {
      out.failed += 1;
      if (await recordTalentFailure(admin, row, "Stored token missing.", true)) {
        out.needsReconnect += 1;
      }
      continue;
    }
    const res = await refreshInstagramToken(token);
    if (!res.ok) {
      out.failed += 1;
      if (await recordTalentFailure(admin, row, res.error, isFatalFailure(res.status))) {
        out.needsReconnect += 1;
      }
      continue;
    }
    const stored = await setTalentIntegrationSecret(
      row.talent_profile_id,
      INSTAGRAM_TALENT_INTEGRATION_KEY,
      "access_token",
      res.accessToken,
    );
    if (!stored) {
      out.failed += 1;
      if (
        await recordTalentFailure(admin, row, "Refreshed token could not be stored.", false)
      ) {
        out.needsReconnect += 1;
      }
      continue;
    }
    const rest = { ...config };
    delete rest.refresh_consecutive_failures;
    delete rest.refresh_last_failure_at;
    delete rest.refresh_last_error;
    await upsertTalentIntegration({
      talentProfileId: row.talent_profile_id,
      providerKey: INSTAGRAM_TALENT_INTEGRATION_KEY,
      status: "connected",
      settingsJson: { ...rest, token_expires_at: res.expiresAt, needs_reconnect: false },
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
    });
    out.refreshed += 1;
  }
  return out;
}
