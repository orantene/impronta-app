import type { SupabaseClient } from "@supabase/supabase-js";

import { unstable_cache } from "next/cache";

import { improntaLog } from "@/lib/server/structured-log";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  EMPTY_TRACKING_CONFIG,
  parseTrackingConfig,
  trackingToSettings,
  withTrackingId,
  type OwnedTrackingConfig,
  type TenantTrackingConfig,
  type TrackingProviderId,
} from "@/lib/site-admin/tracking";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * tracking-settings.ts — the I/O half of Website → Setup → Tracking.
 *
 * WHERE THE CONFIG LIVES, AND WHY THERE IS NO MIGRATION
 * ─────────────────────────────────────────────────────
 * `agencies.settings.tracking`, a JSON object of at most four short strings per
 * tenant. This is the idiom the neighbouring page-ROLE pointers already use
 * (`server/page-roles.ts`), and the data has none of the properties that would
 * argue for a table: it is a fixed, tiny set of single-valued keys, it is never
 * queried across tenants, never joined, never sorted, never listed. A table plus
 * RLS policies plus an RPC would be more moving parts guarding strictly less.
 * The custom-code library got a table because it holds many rows per tenant with
 * their own publish state and history; this holds four strings.
 *
 * WHO WRITES `agencies.settings`
 * ──────────────────────────────
 * The service role, exactly as `page-role-actions.ts` does. Tenant staff do not
 * have an RLS grant to update the `agencies` row, so a staff-client write would
 * fail silently (zero rows matched, no error). The privilege is confined here:
 * every write takes the tenant id from the caller's resolved workspace scope,
 * never from client input, and is pinned with `.eq("id", tenantId)`.
 *
 * These functions must not read `headers()` / `cookies()` — `tenantId` is the
 * only per-request input, which is what makes the `unstable_cache` key correct.
 */

/** Read the stored config for one tenant. Never throws: a workspace whose
 *  settings cannot be read renders with no tracking, not with an error. */
export async function readTenantTracking(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantTrackingConfig> {
  if (!tenantId) return { ...EMPTY_TRACKING_CONFIG };
  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (error || !data) {
    if (error) {
      void improntaLog("site_admin_tracking.warn", {
        message: "[site-admin/tracking] read failed",
        tenantId,
        error: error.message,
      });
    }
    return { ...EMPTY_TRACKING_CONFIG };
  }
  return parseTrackingConfig(data.settings);
}

/**
 * Connect (value) or disconnect (null) ONE provider, merging into the existing
 * `agencies.settings` JSON so no other surface's keys are clobbered. The
 * settings blob is re-read immediately before the update for the same reason
 * `writeTenantPageRole` does it: two admin surfaces share this column.
 */
export async function writeTenantTrackingId(
  supabase: SupabaseClient,
  tenantId: string,
  provider: TrackingProviderId,
  value: string | null,
): Promise<{ ok: true; config: TenantTrackingConfig } | { ok: false; error: string }> {
  if (!tenantId) return { ok: false, error: "Missing tenant." };
  const { data, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle<{ settings: unknown }>();
  if (readErr) {
    void improntaLog("site_admin_tracking.warn", {
      message: "[site-admin/tracking] write pre-read failed",
      tenantId,
      error: readErr.message,
    });
    return { ok: false, error: "Could not load your workspace settings." };
  }

  const next = withTrackingId(parseTrackingConfig(data?.settings), provider, value);
  const nextSettings = trackingToSettings(data?.settings, next);
  const { error: writeErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings })
    .eq("id", tenantId);
  if (writeErr) {
    void improntaLog("site_admin_tracking.warn", {
      message: "[site-admin/tracking] write failed",
      tenantId,
      error: writeErr.message,
    });
    return { ok: false, error: "Could not save that connection." };
  }
  return { ok: true, config: next };
}

/**
 * Cached storefront read, tagged with the tenant `storefront` tag so a save is
 * live on the next request rather than at TTL expiry.
 *
 * Returns an OWNED config: the tenant id travels with the data so
 * `selectTrackingForRender` has something to compare the rendering tenant
 * against, instead of trusting that this function was called with the right
 * argument. Returns `null` on any failure or on an unresolved tenant, which the
 * selector treats as "emit nothing".
 */
export function loadTenantTracking(
  tenantId: string,
): Promise<OwnedTrackingConfig | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<OwnedTrackingConfig | null> => {
      // Service role: `agencies.settings` is not anon-readable, and a storefront
      // request carries no session. The read is pinned to the single row whose
      // id is the argument, so the privilege buys exactly one row.
      const svc = createServiceRoleClient();
      if (!svc) return null;
      const providers = await readTenantTracking(svc, tenantId);
      return { tenantId, providers };
    },
    ["site-admin:tracking:config", tenantId],
    {
      tags: [tagFor(tenantId, "storefront")],
      // Same defensive safety-net TTL as the identity / branding readers.
      revalidate: 300,
    },
  )();
}
