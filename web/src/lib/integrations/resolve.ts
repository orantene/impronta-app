import "server-only";

import {
  getIntegrationDef,
  primarySecretField,
} from "@/lib/integrations/catalog";
import {
  getDecryptedSecret,
  getTenantIntegration,
  type TenantIntegrationRow,
} from "@/lib/integrations/repository";

/**
 * Tenant Integrations — runtime credential resolution.
 *
 * Mirrors the AI subsystem's resolveKeyForMode(mode, dbKey, envKey): the
 * tenant's custom secret wins when credential_mode='custom' and a secret is
 * stored; otherwise we fall back to the platform env key (inherit). The same
 * resolver shape generalizes across integrations; a thin maps-specific helper
 * (resolveGoogleMapsKey) wires the env fallback for the Maps key.
 */

export type IntegrationCredentialMode = "inherit" | "custom";

/**
 * Generic resolver. Returns the effective mode, the (public) config, and a lazy
 * getSecret() that resolves the decrypted custom secret (custom mode) or the
 * supplied platform env fallback (inherit / no custom secret).
 *
 * @param envFallback platform-level key for this integration's secret field
 *                    (e.g. process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). When the
 *                    integration is inheritable, this is used in inherit mode.
 */
export async function resolveIntegration(
  tenantId: string,
  key: string,
  envFallback: string | null = null,
): Promise<{
  mode: IntegrationCredentialMode;
  config: Record<string, unknown>;
  row: TenantIntegrationRow | null;
  getSecret: () => Promise<string | null>;
}> {
  const def = getIntegrationDef(key);
  const row = await getTenantIntegration(tenantId, key);
  const mode: IntegrationCredentialMode = row?.credential_mode ?? "inherit";
  const config = row?.config_json ?? {};
  const inheritable = def?.inheritable ?? true;
  const secretField = primarySecretField(key);

  const env = envFallback?.trim() || null;

  const getSecret = async (): Promise<string | null> => {
    if (mode === "custom" && secretField) {
      const custom = await getDecryptedSecret(tenantId, key, secretField);
      const c = custom?.trim() || null;
      if (c) return c;
      // custom mode but no usable secret stored: fall back to env only if the
      // integration is inheritable, else null (custom-but-empty = nothing).
      return inheritable ? env : null;
    }
    // inherit mode (or no secret field): platform env key when inheritable.
    return inheritable ? env : null;
  };

  return { mode, config, row, getSecret };
}

/** Platform-level Google Maps / Places key from env (public var first, else server Places key). */
function platformGoogleMapsKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    null
  );
}

/**
 * Resolve the effective Google Maps / Places key for a tenant: the tenant's
 * custom key when credential_mode='custom' and a secret exists, else the
 * platform env key. Returns null only when neither resolves (caller keeps its
 * graceful "map unavailable" fallback box).
 *
 * Pass `null` tenantId (e.g. cross-tenant / platform-root surfaces) to get the
 * platform env key directly.
 */
export async function resolveGoogleMapsKey(
  tenantId: string | null,
): Promise<string | null> {
  const env = platformGoogleMapsKey();
  if (!tenantId) return env;
  const { getSecret } = await resolveIntegration(tenantId, "google_maps", env);
  return getSecret();
}
