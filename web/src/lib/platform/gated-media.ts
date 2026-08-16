import "server-only";

/**
 * gated-media.ts — the one place that reads
 * `platform_settings.media_private_access_enabled`, plus its cache.
 *
 * The decision itself (and the precedence table that lets the environment
 * override this column in both directions) lives in
 * `@/lib/media/private-access`, which stays pure and synchronous so
 * `gatedMediaPath()` can be called once per image with no query behind it.
 * This module is the async half: read the row, cache it, resolve.
 *
 * WHY NOT `unstable_cache`
 * ───────────────────────
 * Two QA sessions in this repo have been misled by an `unstable_cache` entry
 * that survived a `.next/cache` wipe and a dev-server restart, producing a
 * confident "it does not work" about code that worked. A feature switch whose
 * flip appears not to take is exactly that failure again, so the cache here is
 * a plain module-scope memo with a stated lifetime:
 *
 *   • hot for `GATED_MEDIA_SETTING_TTL_MS` (30 s) per server instance;
 *   • dropped immediately in the instance that just wrote the setting;
 *   • never persisted anywhere a restart would not clear.
 *
 * SO HOW LONG DOES A FLIP TAKE?
 * ─────────────────────────────
 * At most 30 seconds for a page to start rendering gated (or public) URLs.
 * Serverless spreads requests across instances, so the write only invalidates
 * the instance that served the save; every other instance re-reads within its
 * own 30 s window. On top of that, URLs already handed to a browser or a CDN
 * keep working for up to `GATED_MEDIA_CDN_MAX_AGE_SECONDS` (5 minutes) — that
 * is the revocation lag the feature ships with, and turning the switch off does
 * not shorten it.
 *
 * The memo holds the PROMISE, not the value, so a burst of concurrent requests
 * on a cold instance shares one query instead of racing several.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolvePrivateMediaAccess,
  type PrivateMediaAccessState,
} from "@/lib/media/private-access";

/** How long one server instance may reuse a read of the setting. */
export const GATED_MEDIA_SETTING_TTL_MS = 30_000;

/**
 * OFF is the degrade-to-safe answer as well as the default: an unreadable
 * setting must land on today's behaviour (public URLs), never on a site whose
 * every photo routes through a gate nobody can confirm is configured.
 */
const SETTING_DEFAULT = false;

let memo: { readAt: number; value: Promise<boolean> } | null = null;

/**
 * Drop the memo. Called by the write path so a super admin who flips the switch
 * sees the new behaviour on their very next request rather than up to 30 s
 * later. Exported for tests.
 */
export function invalidatePlatformGatedMedia(): void {
  memo = null;
}

async function readSetting(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return SETTING_DEFAULT;
    const { data, error } = await admin
      .from("platform_settings")
      .select("media_private_access_enabled")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      logServerError("platform.loadGatedMedia", error);
      return SETTING_DEFAULT;
    }
    // `?? false` covers a row written before the column existed. `!!` alone
    // would say the same thing here; spelled out so the intent survives an
    // edit that changes the default.
    return data?.media_private_access_enabled ?? SETTING_DEFAULT;
  } catch (err) {
    logServerError("platform.loadGatedMedia", err);
    return SETTING_DEFAULT;
  }
}

/** The raw column value, memoised for `GATED_MEDIA_SETTING_TTL_MS`. */
export function loadPlatformGatedMediaSetting(): Promise<boolean> {
  const now = Date.now();
  if (memo && now - memo.readAt < GATED_MEDIA_SETTING_TTL_MS) return memo.value;
  const value = readSetting();
  memo = { readAt: now, value };
  return value;
}

/**
 * The effective state: the setting, the environment override, and whether the
 * signing secret is configured, resolved into one verdict plus the reason for
 * it. The admin card renders this whole object; render paths use `.enabled`.
 */
export async function loadPrivateMediaAccessState(): Promise<PrivateMediaAccessState> {
  return resolvePrivateMediaAccess(await loadPlatformGatedMediaSetting());
}

/**
 * Is the gated media route live? Resolve this ONCE per request and thread the
 * boolean down to `gatedMediaPath()`; do not call it per image.
 */
export async function isPrivateMediaAccessEnabled(): Promise<boolean> {
  return (await loadPrivateMediaAccessState()).enabled;
}

/**
 * Persist the switch (the `platform_settings` singleton). Called by the
 * super-admin `use server` action after it has gated the caller. The raw
 * `.from("platform_settings")` write lives here rather than in the action file
 * for the same reason as workspace-ui.ts: platform_settings has no tenant_id.
 */
export async function writePlatformGatedMediaSetting(
  updatedBy: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        media_private_access_enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeGatedMedia", error);
      return { ok: false };
    }
    // Before returning, not after: the action revalidates the settings page
    // immediately, and a stale memo would re-render the switch in its old
    // position and read as "my save did not take".
    invalidatePlatformGatedMedia();
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeGatedMedia", err);
    return { ok: false };
  }
}
