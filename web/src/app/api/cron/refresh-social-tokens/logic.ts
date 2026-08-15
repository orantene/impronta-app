import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshInstagramToken } from "@/lib/connection-oauth/instagram";
import { refreshTikTokToken } from "@/lib/connection-oauth/tiktok";
import {
  getDecryptedSecret,
  setIntegrationConfig,
  setSecret,
  setSecrets,
} from "@/lib/integrations/repository";
import { emitNotificationToUsers } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";

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
 * FAILURE HANDLING (batch C / C4 — this used to be a one-strike kill switch).
 * The sweep previously wrote `status:"error"` on ANY failure, and only selected
 * `status:"connected"` rows — so a single transient Meta 500 or a momentary DNS
 * blip removed a tenant from every future sweep permanently, silently, with the
 * operator told nothing. TikTok made it worse: tokens live ~24h against a 6h
 * cron, so there were only ~4 chances and one bad one was fatal.
 *
 * Now:
 *   - Failures are CLASSIFIED. A 4xx is the token being genuinely dead →
 *     reconnect immediately. A 5xx, a network error, or a malformed response is
 *     transient → count it and retry.
 *   - Transient failures increment `refresh_consecutive_failures` in the
 *     integration's `config_json` (no schema change — this batch does not own
 *     migrations) and set `status:"error"` WITHOUT `needs_reconnect`.
 *   - `status:"error"` rows are back IN the sweep, gated by exponential backoff
 *     off `refresh_last_failure_at`, so a recovered vendor heals itself.
 *   - `needs_reconnect` is only set on a 4xx or after
 *     MAX_CONSECUTIVE_FAILURES transient failures — and the transition emits a
 *     notification to the workspace's owners/admins, so "your feed is about to
 *     go dark" is an actionable bell instead of a silent flag.
 *   - Any success resets the counter to zero.
 */

const IG_REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const TT_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Transient failures tolerated before a tenant is declared needs-reconnect.
 * Against the 6h cron and the backoff below this is ~a day and a half of a
 * vendor being down before we tell the operator to reconnect — long enough that
 * a real outage does not generate false alarms, short enough that a genuinely
 * broken integration is not discovered by the feed going blank.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

/** First retry delay; doubles per consecutive failure up to the cap. */
const BACKOFF_BASE_MS = 30 * 60 * 1000; // 30 minutes
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000; // 1 day

export type SocialTokenSweepResult = {
  scanned: number;
  refreshed: number;
  failed: number;
  skipped: number;
  /** Rows skipped because their backoff window has not elapsed yet. */
  backedOff: number;
  /** Rows that crossed into needs-reconnect on THIS run (notification sent). */
  needsReconnect: number;
};

const PROVIDER_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

function needsRefresh(expiresAt: unknown, windowMs: number): boolean {
  if (typeof expiresAt !== "string" || !expiresAt) return true; // unknown → try
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return true;
  return ms - Date.now() < windowMs;
}

function readFailureCount(config: Record<string, unknown>): number {
  const raw = config.refresh_consecutive_failures;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * Has this row's backoff elapsed? A row with no recorded failure is always due.
 * Delay doubles per consecutive failure (30m, 1h, 2h, 4h, 8h…) capped at a day,
 * so a vendor outage does not turn into a retry storm.
 */
function backoffElapsed(config: Record<string, unknown>, now: number): boolean {
  const failures = readFailureCount(config);
  if (failures === 0) return true;
  const last = config.refresh_last_failure_at;
  if (typeof last !== "string" || !last) return true;
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return true;
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  return now - lastMs >= delay;
}

/**
 * A vendor 4xx means the grant itself is dead — retrying cannot help. Anything
 * else (5xx, unreachable host, malformed 200) is transient. An ABSENT status is
 * a transport failure, which is the retryable direction.
 */
function isFatalFailure(status: number | undefined): boolean {
  return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * Tell the workspace's owners/admins their social connection needs attention.
 * Best-effort and never throws: `emitNotification` already swallows its own
 * failures, and a missed bell must not abort the rest of the sweep.
 *
 * Copy follows the existing in-app notification convention in this codebase
 * (see payout-reversal-notify.ts / inquiry-engine-messages.ts): the title and
 * body are stored on the row as written, not resolved through the i18n catalog.
 */
async function notifyNeedsReconnect(
  admin: SupabaseClient,
  tenantId: string,
  key: string,
  reason: string,
): Promise<void> {
  try {
    const label = PROVIDER_LABEL[key] ?? key;
    const { data, error } = await admin
      .from("agency_memberships")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);
    if (error || !data) return;
    const userIds = (data as Array<{ profile_id: string | null }>)
      .map((r) => r.profile_id)
      .filter((id): id is string => Boolean(id));
    if (userIds.length === 0) return;

    await emitNotificationToUsers(userIds, {
      tenantId,
      kind: "system",
      surface: "workspace",
      title: `Reconnect ${label}`,
      body:
        `We can no longer refresh the ${label} connection, so the feed on your site will stop ` +
        `updating. Open Settings, Integrations and reconnect the account to fix it. (${reason})`,
      // Deliberately NO targetDrawer: the tenant integrations UI is a settings
      // PAGE, not a registered drawer id, and an unregistered id opens the
      // "Coming up next" stub (the P0-2 trap). Plain text beats a dead link.
      targetDrawer: null,
      targetPayload: { integrationKey: key },
      originEventId: null,
      originKind: "social_token_needs_reconnect",
    });
  } catch (err) {
    logServerError("cron/refresh-social-tokens:notify", err);
  }
}

/**
 * Record a failure. Increments the consecutive counter; flips the integration
 * to `needs_reconnect` (and notifies) only when the failure is fatal or the
 * counter crosses the threshold. Returns whether the row transitioned into
 * needs-reconnect on this call, so the caller can count it.
 */
async function recordFailure(
  admin: SupabaseClient,
  tenantId: string,
  key: string,
  config: Record<string, unknown>,
  error: string,
  opts: { fatal: boolean },
): Promise<boolean> {
  const failures = readFailureCount(config) + 1;
  const alreadyFlagged = config.needs_reconnect === true;
  const shouldFlag = opts.fatal || failures >= MAX_CONSECUTIVE_FAILURES;

  await setIntegrationConfig(
    tenantId,
    key,
    {
      ...config,
      needs_reconnect: shouldFlag ? true : false,
      refresh_consecutive_failures: failures,
      refresh_last_failure_at: new Date().toISOString(),
      refresh_last_error: error,
    },
    { status: "error", lastError: error },
  );

  // Notify only on the TRANSITION, so a stuck integration does not re-bell the
  // owners on every sweep.
  if (shouldFlag && !alreadyFlagged) {
    await notifyNeedsReconnect(admin, tenantId, key, error);
    return true;
  }
  return false;
}

/** Record a success: clear the failure bookkeeping and re-arm the row. */
async function recordSuccess(
  tenantId: string,
  key: string,
  config: Record<string, unknown>,
  tokenExpiresAt: string | null,
): Promise<void> {
  await setIntegrationConfig(
    tenantId,
    key,
    {
      ...config,
      token_expires_at: tokenExpiresAt,
      needs_reconnect: false,
      // null DELETES the key from the merged config (see setIntegrationConfig).
      refresh_consecutive_failures: null,
      refresh_last_failure_at: null,
      refresh_last_error: null,
    },
    { status: "connected", lastError: null, lastVerifiedAt: new Date().toISOString() },
  );
}

export async function sweepSocialTokens(
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

  // `error` rows are IN the sweep now — that is the whole point of C4. Rows
  // already flagged `needs_reconnect` are filtered out below: those need an
  // operator, and re-hammering a dead grant every 6h helps nobody.
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("tenant_id, integration_key, config_json, status")
    .in("integration_key", ["instagram", "tiktok"])
    .in("status", ["connected", "error"]);
  if (error || !data) return out;

  const now = Date.now();

  for (const row of data as Array<{
    tenant_id: string;
    integration_key: string;
    config_json: Record<string, unknown> | null;
    status: string;
  }>) {
    out.scanned += 1;
    const config = row.config_json ?? {};
    const key = row.integration_key;

    // Already declared dead — an operator has to reconnect; nothing to retry.
    if (config.needs_reconnect === true) {
      out.skipped += 1;
      continue;
    }
    // Failing row whose retry window has not opened yet.
    if (!backoffElapsed(config, now)) {
      out.backedOff += 1;
      continue;
    }

    if (key === "instagram") {
      if (!needsRefresh(config.token_expires_at, IG_REFRESH_WINDOW_MS)) {
        out.skipped += 1;
        continue;
      }
      const token = await getDecryptedSecret(row.tenant_id, "instagram", "access_token");
      if (!token) {
        // No stored token at all — retrying cannot conjure one. Fatal.
        out.failed += 1;
        if (
          await recordFailure(admin, row.tenant_id, key, config, "Stored token missing.", {
            fatal: true,
          })
        ) {
          out.needsReconnect += 1;
        }
        continue;
      }
      const res = await refreshInstagramToken(token);
      if (!res.ok) {
        out.failed += 1;
        if (
          await recordFailure(admin, row.tenant_id, key, config, res.error, {
            fatal: isFatalFailure(res.status),
          })
        ) {
          out.needsReconnect += 1;
        }
        continue;
      }
      // Instagram hands back a single token, so one write is already atomic.
      const stored = await setSecret(
        row.tenant_id,
        "instagram",
        "access_token",
        res.accessToken,
      );
      if (!stored) {
        // The refresh worked but we could not persist it. Transient (a DB
        // hiccup) — count it and retry rather than declaring the token dead.
        out.failed += 1;
        if (
          await recordFailure(
            admin,
            row.tenant_id,
            key,
            config,
            "Refreshed token could not be stored.",
            { fatal: false },
          )
        ) {
          out.needsReconnect += 1;
        }
        continue;
      }
      await recordSuccess(row.tenant_id, key, config, res.expiresAt);
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
      if (
        await recordFailure(
          admin,
          row.tenant_id,
          key,
          config,
          "Stored refresh token missing.",
          { fatal: true },
        )
      ) {
        out.needsReconnect += 1;
      }
      continue;
    }
    const res = await refreshTikTokToken(refreshToken);
    if (!res.ok) {
      out.failed += 1;
      if (
        await recordFailure(admin, row.tenant_id, key, config, res.error, {
          fatal: isFatalFailure(res.status),
        })
      ) {
        out.needsReconnect += 1;
      }
      continue;
    }
    // TikTok ROTATES the refresh token: the one we just sent is now dead. These
    // MUST land together — two separate writes meant a failure on the second
    // left us holding an invalidated refresh token and the integration could
    // never recover. `setSecrets` is a single upsert statement.
    const stored = await setSecrets(row.tenant_id, "tiktok", [
      { secretField: "access_token", plaintext: res.token.accessToken },
      ...(res.token.refreshToken
        ? [{ secretField: "refresh_token", plaintext: res.token.refreshToken }]
        : []),
    ]);
    if (!stored) {
      out.failed += 1;
      if (
        await recordFailure(
          admin,
          row.tenant_id,
          key,
          config,
          "Rotated tokens could not be stored.",
          { fatal: false },
        )
      ) {
        out.needsReconnect += 1;
      }
      continue;
    }
    await recordSuccess(row.tenant_id, key, config, res.token.expiresAt);
    out.refreshed += 1;
  }

  return out;
}
