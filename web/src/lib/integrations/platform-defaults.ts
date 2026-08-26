import "server-only";

import { cache } from "react";

import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import {
  getDecryptedSecret,
  getSecretStatus,
  getTenantIntegration,
} from "@/lib/integrations/repository";

/**
 * Platform integration DEFAULTS — the values every tenant INHERITS.
 *
 * The super-admin can set the platform's own default integration keys (Google
 * Maps, GA4, captcha, email-from) in the platform admin UI. Those are stored as
 * ordinary integration rows under the platform tenant id
 * (the network HUB — see `platformTenantId` below) — the same tables every
 * tenant uses, no new schema. This module is the READ side: it surfaces those stored values to the
 * runtime resolver so a tenant's `inherit` resolution becomes
 *
 *     tenant-custom  →  platform-DB-default  →  process.env
 *
 * ── Zero-regression guarantee ──────────────────────────────────────────────
 * Every getter here returns `null` when the platform tenant has no row / the
 * field is empty. The resolver treats `null` as "fall through to the EXACT
 * current env behavior", so when no platform default is configured the behavior
 * is byte-for-byte identical to today.
 *
 * ── Performance ────────────────────────────────────────────────────────────
 * The platform-default read must NOT hit the DB fresh on every request. Two
 * layers guard it:
 *   1. React `cache()` — per-request dedupe (one DB read per integration per
 *      request, regardless of how many resolvers ask).
 *   2. A small module-level TTL cache (60s) — so a hot path across requests
 *      doesn't hammer the DB either. The platform defaults change rarely (only
 *      when the super-admin edits them); a ≤60s staleness window is fine.
 *
 * ── Secrecy ────────────────────────────────────────────────────────────────
 * Decrypted secrets never leave the server here. The only secret this module
 * exposes is the platform's own referer-restricted BROWSER Maps key — the same
 * value the platform already ships to the client via NEXT_PUBLIC_*, and only
 * via the explicitly client-safe getter below.
 */

/**
 * The tenant row that HOLDS the platform's integration defaults.
 *
 * This USED to be `DEFAULT_AI_TENANT_ID` — which is a REAL CUSTOMER AGENCY
 * (Impronta, 00000000-…-0001). So "the default every agency inherits" and
 * "that one customer's private integration config" were literally the same
 * database row: if the customer set their own captcha in their workspace
 * settings, they silently rewrote the default for EVERY other agency. With one
 * tenant nobody notices; at 1000 tenants it is a cross-customer data bug.
 *
 * The platform's own workspace is the network HUB (kind='hub',
 * plan_tier='network'), which is what "the platform's own keys" actually
 * means. Resolved rather than hardcoded so dev / preview / prod each find
 * their own hub.
 *
 * Returns null when no hub exists → every getter below returns null → the
 * resolver falls through to `process.env`, which is this module's documented
 * zero-regression contract. It never falls back to a customer's row.
 */
async function platformTenantId(): Promise<string | null> {
  return ttlMemo("platform:tenant-id", async () => {
    const hub = await getPlatformHubTenant();
    return hub?.tenantId ?? null;
  });
}

const TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expires: number };

/**
 * Generic 60s TTL memo. Keyed by an arbitrary string. Returns the cached value
 * when fresh, otherwise runs `load`, stores, and returns it. Errors are NOT
 * cached (so a transient DB blip doesn't pin a null for 60s).
 */
const ttlStore = new Map<string, CacheEntry<unknown>>();

async function ttlMemo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = ttlStore.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await load();
  ttlStore.set(key, { value, expires: now + TTL_MS });
  return value;
}

/**
 * Read a PUBLIC config field from the platform tenant's integration row.
 * Returns the trimmed string, or null when the row/field is absent or empty.
 * Wrapped in React `cache()` (per-request dedupe) + a 60s TTL memo.
 */
export const platformConfigField = cache(
  async (integrationKey: string, field: string): Promise<string | null> => {
    return ttlMemo(`config:${integrationKey}:${field}`, async () => {
      const tenantId = await platformTenantId();
      if (!tenantId) return null;
      const row = await getTenantIntegration(tenantId, integrationKey);
      const config = (row?.config_json ?? {}) as Record<string, unknown>;
      const v = config[field];
      if (typeof v !== "string") return null;
      return v.trim() || null;
    });
  },
);

/**
 * Decrypt + return a SECRET field from the platform tenant's integration row.
 * Returns null when absent/empty/undecryptable. SERVER-ONLY — callers must
 * never serialize this to the browser (the lone exception being the platform's
 * own referer-restricted Maps browser key, handled via the client-safe getter).
 * Wrapped in React `cache()` + a 60s TTL memo.
 */
export const platformSecret = cache(
  async (integrationKey: string, field: string): Promise<string | null> => {
    return ttlMemo(`secret:${integrationKey}:${field}`, async () => {
      try {
        const tenantId = await platformTenantId();
        if (!tenantId) return null;
        const v = await getDecryptedSecret(tenantId, integrationKey, field);
        return v?.trim() || null;
      } catch {
        return null;
      }
    });
  },
);

/**
 * NON-SENSITIVE presence + last4 for a platform-default secret. Safe to surface
 * to the (super-admin gated) platform UI loader. Never returns ciphertext or
 * plaintext. NOT cached — the admin UI wants a fresh read after a save.
 */
export async function platformSecretStatus(
  integrationKey: string,
  field: string,
): Promise<{ present: boolean; last4: string | null }> {
  const tenantId = await platformTenantId();
  if (!tenantId) return { present: false, last4: null };
  return getSecretStatus(tenantId, integrationKey, field);
}

/** The canonical platform tenant id these defaults live under. */
export { platformTenantId };

/**
 * Drop any memoized platform-default entries. Call after a platform-admin write
 * so the next read reflects the new value immediately rather than waiting out
 * the 60s TTL. (React's per-request `cache()` is request-scoped and resets on
 * its own; this only clears the cross-request TTL layer.)
 */
export function invalidatePlatformDefaultsCache(): void {
  ttlStore.clear();
}
